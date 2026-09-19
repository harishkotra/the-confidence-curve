/**
 * The sweep engine: every question x every model, graded in code, streamed out.
 */

import { aggregate, findCrossover } from './aggregate.ts';
import { grade, extractAnswer } from './grade.ts';
import { QUESTION_BANK, getQuestion } from './questionBank.ts';
import { HttpTransport, ProviderError, callWithRetry, type Transport } from './provider.ts';
import { appendRecord, appendSummary, initRunFile } from './store.ts';
import type { Condition, CurveResult, ModelSlot, Record_, RunConfig, SweepEvent } from './types.ts';

export interface SweepOptions {
  config: RunConfig;
  questionIds?: string[];
  condition: Condition;
  transport?: Transport;
  /** Called for each event; the SSE route forwards these to the browser. */
  onEvent?: (event: SweepEvent) => void;
}

/** Strip the API key before a config is emitted, stored or returned. */
export function redactConfig(config: RunConfig): Omit<RunConfig, 'apiKey'> {
  const { apiKey: _drop, ...rest } = config;
  return rest;
}

export function newRunId(condition: Condition): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  return `${stamp}-${condition}`;
}

/**
 * How many calls may be in flight at once. Override with SWEEP_CONCURRENCY=1 to
 * go back to strictly sequential calls, which gives cleaner latency numbers.
 */
const concurrency = Math.max(1, Math.floor(Number(process.env['SWEEP_CONCURRENCY'] ?? 4)) || 4);

/**
 * Per-request timeout. A reasoning model can legitimately take a couple of
 * minutes on a hard question, so this is generous — but it must be finite, or a
 * hung connection would freeze the sweep with the counter stuck.
 */
const callTimeoutMs = Math.max(5_000, Number(process.env['REQUEST_TIMEOUT_MS'] ?? 240_000) || 240_000);

/**
 * One line per graded call on the server console. Without this a slow sweep is
 * indistinguishable from a hung one: the browser counter only moves when a call
 * returns, so the terminal is where the progress is actually visible.
 */
function logCall(done: number, total: number, record: Record_): void {
  const tag = `[${String(done).padStart(3, ' ')}/${total}]`;
  const who = `${record.questionId} ${record.slot} ${record.model}`;
  if (record.error) {
    const first = record.error.split('\n')[0] ?? record.error;
    console.log(`${tag} ${who}  FAILED  ${first}`);
    return;
  }
  const secs = `${(record.latencyMs / 1000).toFixed(1)}s`;
  const verdict = record.correct ? 'ok  ' : 'miss';
  const retry = record.retried ? ' (retried with doubled budget)' : '';
  console.log(
    `${tag} ${who}  ${verdict}  ${secs.padStart(7)}  ${record.reasoningTokens} reasoning tok${retry}`,
  );
}

export async function runSweep(options: SweepOptions): Promise<CurveResult> {
  const { config, condition } = options;
  const transport = options.transport ?? new HttpTransport();
  const emit = options.onEvent ?? (() => {});

  const questions = options.questionIds?.length
    ? options.questionIds.map((id) => getQuestion(id)).filter((q): q is NonNullable<typeof q> => Boolean(q))
    : QUESTION_BANK;

  if (questions.length === 0) {
    throw new Error('No questions selected.');
  }

  const runId = newRunId(condition);
  const models: { slot: ModelSlot; model: string }[] = [
    { slot: 'A', model: config.modelA },
    { slot: 'B', model: config.modelB },
  ];

  const total = questions.length * models.length;
  const safeConfig = redactConfig(config);

  await initRunFile(runId, {
    runId,
    condition,
    at: new Date().toISOString(),
    config: safeConfig,
    questions: questions.length,
    total,
  });

  emit({ type: 'start', runId, condition, total, config: safeConfig });

  const records: Record_[] = new Array<Record_>(total);
  let done = 0;
  let nextIndex = 0;

  // Bounded concurrency. Strictly sequential calls are the cleanest way to
  // measure latency, but a real reasoning model can spend a minute or more on a
  // hard question — 100 sequential calls is then over an hour, and the counter
  // moving once a minute reads as a hang. A few in flight keeps the sweep
  // usable; latency under load is noisier, which the app already notes.
  const tasks: { question: (typeof questions)[number]; slot: ModelSlot; model: string }[] = [];
  for (const question of questions) {
    for (const { slot, model } of models) tasks.push({ question, slot, model });
  }

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const task = tasks[index];
      if (!task) return;

      const record = await measure({
        runId,
        condition,
        config,
        transport,
        question: task.question,
        slot: task.slot,
        model: task.model,
        timeoutMs: callTimeoutMs,
      });
      // Held in question order in memory, so the result and the JSONL summary
      // are stable. The JSONL file itself is appended as calls *complete*, to
      // keep the write-before-show durability: a sweep that dies mid-flight
      // still leaves every finished record on disk.
      records[index] = record;
      await appendRecord(record);
      done += 1;
      logCall(done, total, record);
      emit({ type: 'progress', done, total, record });
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));

  const modelNames: Record<ModelSlot, string> = { A: config.modelA, B: config.modelB };
  const agg = aggregate(records, modelNames);
  const crossover = findCrossover(agg);

  const result: CurveResult = {
    runId,
    condition,
    config: safeConfig,
    records,
    aggregate: agg,
    crossover,
  };

  await appendSummary(runId, {
    at: new Date().toISOString(),
    crossover: crossover.difficulty,
    totals: agg.totals,
  });

  emit({ type: 'done', result });
  return result;
}

interface MeasureArgs {
  runId: string;
  condition: Condition;
  config: RunConfig;
  transport: Transport;
  question: (typeof QUESTION_BANK)[number];
  slot: ModelSlot;
  model: string;
  timeoutMs: number;
}

async function measure(args: MeasureArgs): Promise<Record_> {
  const { runId, condition, config, transport, question, slot, model, timeoutMs } = args;
  const base = {
    runId,
    condition,
    questionId: question.id,
    difficulty: question.difficulty,
    category: question.category,
    slot,
    model,
    expected: question.answer,
    at: new Date().toISOString(),
  };

  try {
    const result = await callWithRetry(transport, model, question.question, config, timeoutMs);
    const extracted = extractAnswer(result.content);
    const correct = grade(extracted, question.answer, question.aliases);
    return {
      ...base,
      raw: result.content,
      extracted,
      correct,
      latencyMs: result.latencyMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      reasoningTokens: result.reasoningTokens,
      retried: result.retried,
    };
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : err instanceof Error ? err.message : String(err);
    return {
      ...base,
      raw: '',
      extracted: null,
      correct: false,
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      error: message,
    };
  }
}