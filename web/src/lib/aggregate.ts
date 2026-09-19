/**
 * Client-side aggregation, mirrored from the server.
 *
 * The server aggregates a finished run. This version runs in the browser so
 * the surface can be built from records as they stream in, rather than
 * appearing only once the sweep is over.
 */

import { DIFFICULTIES, type Aggregate, type Cell, type ModelSlot, type Record_ } from './types';

export function aggregate(records: Record_[], modelNames: Record<ModelSlot, string>): Aggregate {
  const cells: Cell[] = [];
  const slots: ModelSlot[] = ['A', 'B'];

  for (const difficulty of DIFFICULTIES) {
    for (const slot of slots) {
      const rs = records.filter((r) => r.difficulty === difficulty && r.slot === slot);
      const n = rs.length;
      const correct = rs.filter((r) => r.correct).length;
      cells.push({
        difficulty,
        slot,
        model: modelNames[slot],
        accuracy: n === 0 ? 0 : (correct / n) * 100,
        meanReasoningTokens: n === 0 ? 0 : mean(rs.map((r) => r.reasoningTokens)),
        meanLatencyMs: n === 0 ? 0 : mean(rs.map((r) => r.latencyMs)),
        meanCompletionTokens: n === 0 ? 0 : mean(rs.map((r) => r.completionTokens)),
        samples: n,
        correct,
      });
    }
  }

  const totals = slots.map((slot) => {
    const rs = records.filter((r) => r.slot === slot);
    const n = rs.length;
    return {
      slot,
      model: modelNames[slot],
      accuracy: n === 0 ? 0 : (rs.filter((r) => r.correct).length / n) * 100,
      reasoningTokens: rs.reduce((a, r) => a + r.reasoningTokens, 0),
      completionTokens: rs.reduce((a, r) => a + r.completionTokens, 0),
      latencyMs: rs.reduce((a, r) => a + r.latencyMs, 0),
      samples: n,
    };
  });

  return { cells, totals };
}

/**
 * How many samples each cell will hold when the run finishes. Used to render
 * a partially measured column as provisional rather than final.
 */
export function expectedSamplesPerCell(questionCount: number, questionsPerDifficulty = 5): number {
  return Math.max(1, Math.round(questionCount / (DIFFICULTIES.length * questionsPerDifficulty)) * questionsPerDifficulty);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}