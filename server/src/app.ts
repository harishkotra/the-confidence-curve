/**
 * The API. Hono on port 3001. Bootstrapped by index.ts.
 *
 *   GET  /api/health
 *   GET  /api/questions           the question bank, so the UI can show it
 *   POST /api/curve               run a sweep, stream progress over SSE
 *   GET  /api/runs                list stored runs
 *   GET  /api/runs/:runId         read a stored run back
 *
 * The API key arrives in the POST body from the browser's localStorage and is
 * never persisted server-side, never logged, and never echoed back.
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { aggregate, findCrossover } from './aggregate.ts';
import { QUESTION_BANK, validateBank } from './questionBank.ts';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, type Transport } from './provider.ts';
import { listRuns, readRun } from './store.ts';
import { runSweep } from './sweep.ts';
import type { Condition, CurveResult, ModelSlot, RunConfig, SweepEvent } from './types.ts';

const PORT = Number(process.env['PORT'] ?? 3001);

export const DEFAULT_CONFIG = {
  baseUrl: 'https://api.particle.ai/v1',
  modelA: 'deepseek-v4-flash-0731',
  modelB: 'deepseek-v4.1-flash',
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
};

export interface AppOptions {
  /** Injectable for tests and for the offline verification sweep. */
  transport?: Transport;
}

interface CurveBody {
  questionIds?: string[];
  condition?: Condition;
  config?: Partial<RunConfig>;
  apiKey?: string;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, questions: QUESTION_BANK.length }));

  app.get('/api/questions', (c) => {
    const problems = validateBank();
    return c.json({
      questions: QUESTION_BANK,
      valid: problems.length === 0,
      problems,
      defaults: DEFAULT_CONFIG,
    });
  });

  app.get('/api/runs', async (c) => c.json({ runs: await listRuns() }));

  app.get('/api/runs/:runId', async (c) => {
    const runId = c.req.param('runId');
    const records = await readRun(runId);
    if (records.length === 0) return c.json({ error: `No stored run named ${runId}.` }, 404);
    const modelNames: Record<ModelSlot, string> = {
      A: records[0]?.model ?? 'A',
      B: records.find((r) => r.slot === 'B')?.model ?? 'B',
    };
    const agg = aggregate(records, modelNames);
    const result: CurveResult = {
      runId,
      condition: records[0]?.condition ?? 'reasoning',
      config: {
        baseUrl: '',
        modelA: modelNames.A,
        modelB: modelNames.B,
        temperature: DEFAULT_TEMPERATURE,
        maxTokens: DEFAULT_MAX_TOKENS,
        disableReasoning: (records[0]?.condition ?? 'reasoning') === 'noreasoning',
      },
      records,
      aggregate: agg,
      crossover: findCrossover(agg),
    };
    return c.json(result);
  });

  app.post('/api/curve', async (c) => {
    let body: CurveBody;
    try {
      body = (await c.req.json()) as CurveBody;
    } catch {
      return c.json({ error: 'Request body must be JSON.' }, 400);
    }

    const config = resolveConfig(body);
    const condition: Condition = body.condition === 'noreasoning' ? 'noreasoning' : 'reasoning';

    if (!config.apiKey) {
      return c.json(
        {
          error:
            'No API key. Open Settings and paste your key — it is stored only in this browser and sent per request.',
        },
        400,
      );
    }
    if (!config.modelA.trim() || !config.modelB.trim()) {
      return c.json({ error: 'Both model names are required.' }, 400);
    }

    // Validate the URL before opening a stream, so a typo is a clean 400.
    try {
      new URL(config.baseUrl);
    } catch {
      return c.json({ error: `Base URL is not a valid URL: ${config.baseUrl}` }, 400);
    }

    return streamSSE(c, async (stream) => {
      const queue: SweepEvent[] = [];
      let notify: (() => void) | null = null;
      let finished = false;

      const push = (event: SweepEvent) => {
        queue.push(event);
        notify?.();
        notify = null;
      };

      const sweep = runSweep({
        config,
        questionIds: body.questionIds,
        condition,
        transport: options.transport,
        onEvent: push,
      })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          push({ type: 'error', message });
        })
        .finally(() => {
          finished = true;
          notify?.();
          notify = null;
        });

      while (!finished || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
          continue;
        }
        const event = queue.shift();
        if (!event) continue;
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        if (event.type === 'done' || event.type === 'error') break;
      }

      await sweep;
    });
  });

  return app;
}

function resolveConfig(body: CurveBody): RunConfig {
  const c = body.config ?? {};
  return {
    baseUrl: (c.baseUrl ?? DEFAULT_CONFIG.baseUrl).trim(),
    apiKey: (body.apiKey ?? c.apiKey ?? '').trim(),
    modelA: (c.modelA ?? DEFAULT_CONFIG.modelA).trim(),
    modelB: (c.modelB ?? DEFAULT_CONFIG.modelB).trim(),
    temperature: typeof c.temperature === 'number' ? c.temperature : DEFAULT_CONFIG.temperature,
    maxTokens: typeof c.maxTokens === 'number' && c.maxTokens > 0 ? c.maxTokens : DEFAULT_CONFIG.maxTokens,
    disableReasoning: Boolean(c.disableReasoning),
  };
}
