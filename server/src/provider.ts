/**
 * Model calls. Plain `fetch` against an OpenAI-compatible /chat/completions.
 * No SDK.
 *
 * Privacy rule enforced here: `reasoning_content` is read out of the response
 * only to be discarded. It is never returned, logged, stored or rendered —
 * only the reasoning *token count* survives this module.
 */

import type { RunConfig } from './types.ts';

export const SYSTEM_PROMPT =
  'You are a precise assistant. Answer the question directly. End your answer with a final line of exactly: ANSWER: <your answer>';

export const DEFAULT_MAX_TOKENS = 1600;
export const DEFAULT_TEMPERATURE = 0;

export interface CallResult {
  /** The assistant's message content. Never contains reasoning_content. */
  content: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  /** True when the doubled-budget retry produced this result. */
  retried: boolean;
}

/** Carries the provider's real error text so the UI can show it verbatim. */
export class ProviderError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export interface Transport {
  call(
    model: string,
    question: string,
    config: RunConfig,
    maxTokens: number,
    timeoutMs?: number,
  ): Promise<CallResult>;
}

/** Default per-request timeout. A hung connection must never freeze a sweep. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 240_000;

/** Read reasoning tokens from the mandated location, defensively. */
function readReasoningTokens(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;
  const u = usage as Record<string, unknown>;
  const details = u['completion_tokens_details'];
  if (details && typeof details === 'object') {
    const rt = (details as Record<string, unknown>)['reasoning_tokens'];
    if (typeof rt === 'number' && Number.isFinite(rt)) return rt;
  }
  // Some OpenAI-compatible servers hoist it to the top level instead.
  const top = u['reasoning_tokens'];
  if (typeof top === 'number' && Number.isFinite(top)) return top;
  return 0;
}

function readNumber(source: unknown, key: string): number {
  if (!source || typeof source !== 'object') return 0;
  const v = (source as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export class HttpTransport implements Transport {
  async call(
    model: string,
    question: string,
    config: RunConfig,
    maxTokens: number,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<CallResult> {
    const url = joinUrl(config.baseUrl, '/chat/completions');
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      temperature: config.temperature,
      max_tokens: maxTokens,
    };
    if (config.disableReasoning) {
      body['chat_template_kwargs'] = { enable_thinking: false };
    }

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const hint =
        err instanceof Error && err.name === 'TimeoutError'
          ? ` (no response within ${Math.round(timeoutMs / 1000)}s)`
          : '';
      throw new ProviderError(`Could not reach ${url}: ${reason}${hint}`);
    }
    const latencyMs = Date.now() - started;

    const text = await response.text();

    if (!response.ok) {
      // Surface the provider's own words, not a paraphrase.
      throw new ProviderError(
        `HTTP ${response.status} from ${url}\n${truncate(text, 1200)}`,
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderError(`Provider returned non-JSON (HTTP ${response.status}):\n${truncate(text, 1200)}`);
    }

    const root = payload as Record<string, unknown>;
    const choices = root['choices'];
    const first = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined;
    const message = first?.['message'] as Record<string, unknown> | undefined;

    // reasoning_content is deliberately dropped here and never referenced again.
    const content = typeof message?.['content'] === 'string' ? (message['content'] as string) : '';

    const usage = root['usage'];
    return {
      content,
      latencyMs,
      promptTokens: readNumber(usage, 'prompt_tokens'),
      completionTokens: readNumber(usage, 'completion_tokens'),
      reasoningTokens: readReasoningTokens(usage),
      retried: false,
    };
  }
}

/**
 * Call a model, retrying once with a doubled token budget when the response
 * comes back with empty content (the usual cause is the whole budget being
 * consumed before the answer was emitted).
 */
export async function callWithRetry(
  transport: Transport,
  model: string,
  question: string,
  config: RunConfig,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<CallResult> {
  const first = await transport.call(model, question, config, config.maxTokens, timeoutMs);
  if (first.content.trim().length > 0) return first;

  const retry = await transport.call(model, question, config, config.maxTokens * 2, timeoutMs);
  return { ...retry, retried: true, latencyMs: first.latencyMs + retry.latencyMs };
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…';
}