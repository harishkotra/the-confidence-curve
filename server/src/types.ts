/** Shared shapes between the sweep engine, the API and the frontend. */

import type { Category } from './questionBank.ts';

export type ModelSlot = 'A' | 'B';

/** Which sweep produced a record. */
export type Condition = 'reasoning' | 'noreasoning';

export interface RunConfig {
  baseUrl: string;
  apiKey: string;
  modelA: string;
  modelB: string;
  temperature: number;
  maxTokens: number;
  /** When true, send chat_template_kwargs.enable_thinking = false. */
  disableReasoning: boolean;
}

/** One (question x model) measurement. This is what lands in the JSONL. */
export interface Record_ {
  runId: string;
  condition: Condition;
  questionId: string;
  difficulty: number;
  category: Category;
  slot: ModelSlot;
  model: string;
  /** The model's full response text, as returned. Never contains reasoning_content. */
  raw: string;
  /** The extracted `ANSWER:` line, or null when the model never produced one. */
  extracted: string | null;
  /** The stored answer from the bank. */
  expected: string;
  correct: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  /** From usage.completion_tokens_details.reasoning_tokens. */
  reasoningTokens: number;
  /** Populated when the call failed after retries; the record still counts as incorrect. */
  error?: string;
  /** True when the doubled-budget retry was used. */
  retried?: boolean;
  at: string;
}

export interface Cell {
  difficulty: number;
  slot: ModelSlot;
  model: string;
  /** 0..100 */
  accuracy: number;
  meanReasoningTokens: number;
  meanLatencyMs: number;
  meanCompletionTokens: number;
  samples: number;
  correct: number;
}

export interface Aggregate {
  cells: Cell[];
  totals: {
    slot: ModelSlot;
    model: string;
    accuracy: number;
    reasoningTokens: number;
    completionTokens: number;
    latencyMs: number;
    samples: number;
  }[];
}

export interface Crossover {
  /** The difficulty at which B's advantage first becomes positive and stays positive. */
  difficulty: number | null;
  /** B accuracy minus A accuracy, per difficulty, in difficulty order. */
  gaps: { difficulty: number; gap: number; aAccuracy: number; bAccuracy: number }[];
  /** True when no difficulty had a sustained positive advantage. */
  none: boolean;
}

export interface CurveResult {
  runId: string;
  condition: Condition;
  config: Omit<RunConfig, 'apiKey'>;
  records: Record_[];
  aggregate: Aggregate;
  crossover: Crossover;
}

/** Server-sent events emitted while a sweep runs. */
export type SweepEvent =
  | { type: 'start'; runId: string; condition: Condition; total: number; config: Omit<RunConfig, 'apiKey'> }
  | { type: 'progress'; done: number; total: number; record: Record_ }
  | { type: 'done'; result: CurveResult }
  | { type: 'error'; message: string };