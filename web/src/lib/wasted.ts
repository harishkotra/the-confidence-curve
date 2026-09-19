/**
 * The wasted-compute zone, mirrored from the server.
 *
 * Difficulties where Model B keeps buying deliberation — a large step up in
 * reasoning tokens over the level below — and gets little or no accuracy back.
 * A marginal-return test on B alone, not a comparison against A.
 */

import { DIFFICULTIES, type Aggregate } from './types';

export const WASTED_TOKEN_GROWTH = 0.25;
export const WASTED_ACCURACY_GAIN = 5;

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