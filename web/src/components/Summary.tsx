/** The summary panel: the headline, the gap table, and the token totals. */

import { RAMP_CSS, rampCss, SLOT_COLORS } from '../lib/colour';
import { cellFor, DIFFICULTIES, type Aggregate, type Crossover, type ModelSlot } from '../lib/types';

interface Props {
  aggregate: Aggregate;
  crossover: Crossover;
  wasted: number[];
  modelNames: Record<ModelSlot, string>;
  condition: string;
}

export function Summary({ aggregate, crossover, wasted, modelNames, condition }: Props) {
  const d = crossover.difficulty;
  const maxAbsGap = Math.max(1, ...crossover.gaps.map((g) => Math.abs(g.gap)));
  const tokenRange = reasoningRange(aggregate);

  return (
    <>
      <div className="headline">
        <p className="headline__eyebrow">The extra thinking pays off from</p>
        {d !== null ? (
          <>
            <p className="headline__value headline__value--signal">Difficulty {d}</p>
            <p className="headline__note">
              Below difficulty {d}, Model B's deliberation buys it nothing — Model A is level or
              ahead. From <strong>{d}</strong> upward, <strong>{modelNames.B}</strong> beats{' '}
              <strong>{modelNames.A}</strong> at every single difficulty, and the lead holds.
            </p>
          </>
        ) : (
          <>
            <p className="headline__value headline__value--muted">No crossover</p>
            <p className="headline__note">
              Model B never holds a positive accuracy advantage over Model A at any difficulty in
              this run. The newer model is not earning its extra deliberation on this bank.
            </p>
          </>
        )}
        {wasted.length > 0 ? (
          <p className="headline__note" style={{ marginTop: '0.7rem' }}>
            <span style={{ color: 'var(--hot)' }}>Wasted compute:</span> at{' '}
            {wasted.map((w, i) => (
              <span key={w}>
                {i > 0 ? ', ' : ''}
                <strong>D{w}</strong>
              </span>
            ))}{' '}
            Model B spends sharply more reasoning tokens than the level below for no accuracy gain.
          </p>
        ) : null}
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Accuracy gap by difficulty</h2>
          <span style={{ fontSize: '0.625rem', color: 'var(--dim)' }}>B − A</span>
        </div>
        <table className="gaplist">
          <thead>
            <tr>
              <th>Diff</th>
              <th>A</th>
              <th>B</th>
              <th>Gap</th>
              <th style={{ width: '34%' }} />
            </tr>
          </thead>
          <tbody>
            {crossover.gaps.map((g) => {
              const isCrossover = g.difficulty === d;
              const width = (Math.abs(g.gap) / maxAbsGap) * 100;
              return (
                <tr key={g.difficulty} data-crossover={isCrossover}>
                  <td>{g.difficulty}</td>
                  <td>{g.aAccuracy.toFixed(0)}%</td>
                  <td>{g.bAccuracy.toFixed(0)}%</td>
                  <td>
                    {g.gap >= 0 ? '+' : ''}
                    {g.gap.toFixed(0)}
                  </td>
                  <td>
                    <span
                      className={`gaplist__bar${g.gap < 0 ? ' gaplist__bar--neg' : ''}`}
                      style={{ width: `${Math.max(2, width)}%` }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Reasoning tokens spent</h2>
        </div>
        <div className="totals">
          {aggregate.totals.map((t) => (
            <div className="total" key={t.slot} data-slot={t.slot}>
              <span className="total__model" title={t.model}>
                {t.model}
              </span>
              <span className="total__slot">MODEL {t.slot}</span>
              <div className="total__stat">
                <span>reasoning tokens</span>
                <b>{t.reasoningTokens.toLocaleString()}</b>
              </div>
              <div className="total__stat">
                <span>accuracy</span>
                <b>{t.accuracy.toFixed(1)}%</b>
              </div>
              <div className="total__stat">
                <span>mean latency</span>
                <b>{t.samples ? `${(t.latencyMs / t.samples / 1000).toFixed(1)}s` : '—'}</b>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Colour = reasoning tokens</h2>
          <span style={{ fontSize: '0.625rem', color: 'var(--dim)' }}>{condition}</span>
        </div>
        <div className="legend">
          <div className="legend__ramp" style={{ background: RAMP_CSS }} />
          <div className="legend__ramp-labels">
            <span>{Math.round(tokenRange.min).toLocaleString()} tok</span>
            <span>few → many</span>
            <span>{Math.round(tokenRange.max).toLocaleString()} tok</span>
          </div>
          <div className="legend__row">
            <span className="legend__swatch" style={{ background: SLOT_COLORS.A }} />
            <span>
              Model A · {modelNames.A}
            </span>
          </div>
          <div className="legend__row">
            <span className="legend__swatch" style={{ background: SLOT_COLORS.B }} />
            <span>
              Model B · {modelNames.B}
            </span>
          </div>
          <div className="legend__row">
            <span className="legend__swatch" style={{ background: rampCss(0.95) }} />
            <span>hot column above the crossover = burning tokens</span>
          </div>
        </div>
      </section>
    </>
  );
}

function reasoningRange(agg: Aggregate): { min: number; max: number } {
  const values = agg.cells.map((c) => c.meanReasoningTokens);
  if (!values.length) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

export { DIFFICULTIES, cellFor };