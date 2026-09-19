/** Shapes mirrored from the server. Kept in sync by hand — small and stable. */

export type Category = 'maths' | 'recall' | 'logic' | 'comprehension';
export type ModelSlot = 'A' | 'B';
export type Condition = 'reasoning' | 'noreasoning';

export interface Question {
  id: string;
  difficulty: number;
  category: Category;
  question: string;
  answer: string;
  aliases?: string[];
  note: string;
}

export interface RunConfig {
  baseUrl: string;
  apiKey: string;
  modelA: string;
  modelB: string;
  temperature: number;
  maxTokens: number;
  disableReasoning: boolean;
}

export interface Record_ {
  runId: string;
  condition: Condition;
  questionId: string;
  difficulty: number;
  category: Category;
  slot: ModelSlot;
  model: string;
  raw: string;
  extracted: string | null;
  expected: string;
  correct: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  error?: string;
  retried?: boolean;
  at: string;
}

export interface Cell {
  difficulty: number;
  slot: ModelSlot;
  model: string;
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
  difficulty: number | null;
  gaps: { difficulty: number; gap: number; aAccuracy: number; bAccuracy: number }[];
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

export type SweepEvent =
  | { type: 'start'; runId: string; condition: Condition; total: number; config: Omit<RunConfig, 'apiKey'> }
  | { type: 'progress'; done: number; total: number; record: Record_ }
  | { type: 'done'; result: CurveResult }
  | { type: 'error'; message: string };

export type Phase = 'idle' | 'running' | 'complete' | 'error';

export const DIFFICULTIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function cellFor(agg: Aggregate, difficulty: number, slot: ModelSlot): Cell | undefined {
  return agg.cells.find((c) => c.difficulty === difficulty && c.slot === slot);
}