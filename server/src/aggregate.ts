/** Aggregation per (difficulty, model) and crossover detection. */

import { DIFFICULTIES, QUESTIONS_PER_DIFFICULTY } from './questionBank.ts';
import type { Aggregate, Cell, Crossover, ModelSlot, Record_ } from './types.ts';

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
 * The crossover: the lowest difficulty at which Model B's accuracy advantage
 * over Model A first becomes positive *and stays positive* at every higher
 * difficulty. Computed from the measured data — never hardcoded.
 */
export function findCrossover(agg: Aggregate): Crossover {
  const gaps = DIFFICULTIES.map((difficulty) => {
    const a = agg.cells.find((c) => c.difficulty === difficulty && c.slot === 'A');
    const b = agg.cells.find((c) => c.difficulty === difficulty && c.slot === 'B');
    const aAccuracy = a?.accuracy ?? 0;
    const bAccuracy = b?.accuracy ?? 0;
    return { difficulty, gap: bAccuracy - aAccuracy, aAccuracy, bAccuracy };
  });

  let crossover: number | null = null;
  for (let i = 0; i < gaps.length; i++) {
    const here = gaps[i];
    if (!here || here.gap <= 0) continue;
    const staysPositive = gaps.slice(i).every((g) => g.gap > 0);
    if (staysPositive) {
      crossover = here.difficulty;
      break;
    }
  }

  return { difficulty: crossover, gaps, none: crossover === null };
}

/**
 * The wasted-compute zone: difficulties at or above the crossover where Model B
 * is *hot but flat* — it keeps buying more deliberation (a large step up in
 * reasoning tokens versus the previous difficulty) and gets little or nothing
 * back in accuracy for it.
 *
 * This is a marginal-return test on B alone, not a comparison against A. The
 * question the brief asks is "where is the extra thinking just burning tokens",
 * and the honest signal for that is B's own token curve rising while its
 * accuracy curve flattens or falls.
 */
export const WASTED_TOKEN_GROWTH = 0.25; // >= 25% more reasoning tokens than the level below
export const WASTED_ACCURACY_GAIN = 5; // ...for <= 5 points of accuracy

export function findWastedZone(agg: Aggregate): number[] {
  const bAt = (d: number) => agg.cells.find((c) => c.difficulty === d && c.slot === 'B');
  const out: number[] = [];

  for (const difficulty of DIFFICULTIES) {
    if (difficulty === DIFFICULTIES[0]) continue;
    const prev = bAt(difficulty - 1);
    const here = bAt(difficulty);
    if (!prev || !here || prev.samples === 0 || here.samples === 0) continue;

    const tokenGrowth =
      prev.meanReasoningTokens > 0
        ? (here.meanReasoningTokens - prev.meanReasoningTokens) / prev.meanReasoningTokens
        : 0;
    const accuracyGain = here.accuracy - prev.accuracy;

    if (tokenGrowth >= WASTED_TOKEN_GROWTH && accuracyGain <= WASTED_ACCURACY_GAIN) {
      out.push(difficulty);
    }
  }
  return out;
}

/** Per-difficulty mean reasoning tokens for both slots, for colour scaling. */
export function reasoningRange(agg: Aggregate): { min: number; max: number } {
  const values = agg.cells.map((c) => c.meanReasoningTokens);
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max: max === min ? min + 1 : max };
}

export { QUESTIONS_PER_DIFFICULTY };

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}