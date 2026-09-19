/** The 3D viewport, its overlay, and the hover tooltip. */

import { useEffect, useRef, useState } from 'react';
import { createSurface, type HoverInfo, type SurfaceData, type SurfaceHandle } from '../lib/surface';
import { SLOT_COLORS } from '../lib/colour';
import { cellFor, type Aggregate, type ModelSlot } from '../lib/types';

interface Props {
  data: SurfaceData;
  showGhost: boolean;
  onToggleGhost: (next: boolean) => void;
  onExportReady: (fn: (() => void) | null) => void;
  /** Which run the solid columns show, when both runs exist. */
  primary: 'reasoning' | 'noreasoning';
  onPrimaryChange: (next: 'reasoning' | 'noreasoning') => void;
  hasBoth: boolean;
}

export function SurfaceView({
  data,
  showGhost,
  onToggleGhost,
  onExportReady,
  primary,
  onPrimaryChange,
  hasBoth,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<SurfaceHandle | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [ready, setReady] = useState(false);

  // Mount once. Data updates flow through the second effect.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const handle = createSurface(mount, data, setHover);
    handleRef.current = handle;
    setReady(true);
    return () => {
      handle.dispose();
      handleRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setData(data);
  }, [data]);

  useEffect(() => {
    handleRef.current?.setGhostVisible(showGhost);
  }, [showGhost]);

  // Expose a 2x PNG export to the parent.
  useEffect(() => {
    if (!ready) return;
    onExportReady(() => {
      const handle = handleRef.current;
      if (!handle) return;
      const url = handle.exportPng(2);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `confidence-curve-${stamp}.png`;
      a.click();
    });
    return () => onExportReady(null);
  }, [ready, onExportReady]);

  const crossover = data.crossover.difficulty;

  return (
    <>
      <div className="viewport" ref={mountRef} />

      <div className="overlay">
        <div className="overlay__top">
          <div>
            <p className="axis-label">
              X <b>difficulty</b> · Y <b>model</b> · height <b>accuracy</b> · colour{' '}
              <b>reasoning tokens</b>
            </p>
          </div>

          {crossover !== null ? (
            <div className="crossover-tag">
              <p className="crossover-tag__label">Crossover</p>
              <p className="crossover-tag__value">Difficulty {crossover}</p>
              <p className="crossover-tag__note">
                From here up, Model B beats Model A — and keeps beating it.
              </p>
            </div>
          ) : data.live ? (
            // Mid-sweep the crossover is genuinely unknown — the rule needs
            // every higher difficulty measured. Say so rather than "none".
            <div
              className="crossover-tag"
              style={{ borderColor: 'var(--rule-bright)', background: 'rgba(19,24,32,.85)' }}
            >
              <p className="crossover-tag__label" style={{ color: 'var(--brass)' }}>
                Crossover
              </p>
              <p className="crossover-tag__value" style={{ fontSize: 'var(--step-1)' }}>
                Measuring…
              </p>
              <p className="crossover-tag__note">
                Columns fill in as answers are graded. The crossover needs every difficulty above it
                measured before it can be named.
              </p>
            </div>
          ) : (
            <div className="crossover-tag" style={{ borderColor: 'var(--rule-bright)', background: 'rgba(19,24,32,.85)' }}>
              <p className="crossover-tag__label" style={{ color: 'var(--dim)' }}>
                Crossover
              </p>
              <p className="crossover-tag__value" style={{ fontSize: 'var(--step-1)' }}>
                None found
              </p>
              <p className="crossover-tag__note">
                Model B never holds a positive accuracy advantage at any difficulty.
              </p>
            </div>
          )}
        </div>

        <div className="overlay__top" style={{ alignItems: 'flex-end' }}>
          <p className="axis-label" style={{ pointerEvents: 'auto' }}>
            {data.live
              ? 'provisional columns are outlined · drag to orbit · hover for numbers'
              : 'drag to orbit · scroll to zoom · hover a column for its numbers'}
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', pointerEvents: 'auto' }}>
            {hasBoth ? (
              <div className="switch" role="group" aria-label="Which run the columns show">
                <button
                  type="button"
                  className="switch__opt"
                  aria-pressed={primary === 'reasoning'}
                  onClick={() => onPrimaryChange('reasoning')}
                >
                  reasoning on
                </button>
                <button
                  type="button"
                  className="switch__opt"
                  aria-pressed={primary === 'noreasoning'}
                  onClick={() => onPrimaryChange('noreasoning')}
                >
                  reasoning off
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn--sm btn--signal"
              aria-pressed={showGhost}
              onClick={() => onToggleGhost(!showGhost)}
              disabled={!data.ghost}
              title={
                data.ghost
                  ? 'Overlay the other run as red wireframes'
                  : 'Run the sweep with reasoning disabled to compare'
              }
            >
              {showGhost ? '◼' : '◻'} overlay
            </button>
          </div>
        </div>
      </div>

      {hover ? <Tooltip info={hover} aggregate={data.aggregate} modelNames={data.modelNames} /> : null}
    </>
  );
}

function Tooltip({
  info,
  aggregate,
  modelNames,
}: {
  info: HoverInfo;
  aggregate: Aggregate;
  modelNames: Record<ModelSlot, string>;
}) {
  const a = cellFor(aggregate, info.difficulty, 'A');
  const b = cellFor(aggregate, info.difficulty, 'B');
  const samples = Math.max(a?.samples ?? 0, b?.samples ?? 0);

  // Keep the tooltip inside the viewport.
  const left = Math.min(info.x + 16, window.innerWidth - 250);
  const top = Math.min(info.y + 16, window.innerHeight - 200);

  return (
    <div className="tooltip" style={{ left, top }}>
      <div className="tooltip__head">
        <span className="tooltip__title">Difficulty {info.difficulty}</span>
        <span style={{ color: 'var(--dim)' }}>{samples} samples</span>
      </div>
      {(['A', 'B'] as ModelSlot[]).map((slot) => {
        const cell = slot === 'A' ? a : b;
        return (
          <div key={slot}>
            <div className="tooltip__slot" style={{ color: SLOT_COLORS[slot] }}>
              {slot} · {modelNames[slot]}
            </div>
            <div className="tooltip__row">
              <span>accuracy</span>
              <b>{cell ? `${cell.accuracy.toFixed(0)}%` : '—'}</b>
            </div>
            <div className="tooltip__row">
              <span>mean reasoning tokens</span>
              <b>{cell ? Math.round(cell.meanReasoningTokens).toLocaleString() : '—'}</b>
            </div>
            <div className="tooltip__row">
              <span>mean latency</span>
              <b>{cell ? `${(cell.meanLatencyMs / 1000).toFixed(1)}s` : '—'}</b>
            </div>
          </div>
        );
      })}
      {a && b ? (
        <div className="tooltip__row" style={{ marginTop: '0.35rem', borderTop: '1px solid var(--rule)', paddingTop: '0.3rem' }}>
          <span>B − A</span>
          <b style={{ color: b.accuracy - a.accuracy > 0 ? 'var(--signal)' : 'var(--dim)' }}>
            {b.accuracy - a.accuracy >= 0 ? '+' : ''}
            {(b.accuracy - a.accuracy).toFixed(0)} pts
          </b>
        </div>
      ) : null}
    </div>
  );
}