/** The confidence curve. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bank } from './components/Bank';
import { Settings } from './components/Settings';
import { Summary } from './components/Summary';
import { SurfaceView } from './components/SurfaceView';
import { startSweep } from './lib/api';
import { loadConfig, saveConfig } from './lib/config';
import { aggregate } from './lib/aggregate';
import { findWastedZone } from './lib/wasted';
import type {
  Condition,
  CurveResult,
  ModelSlot,
  Phase,
  Question,
  Record_,
  RunConfig,
  SweepEvent,
} from './lib/types';
import type { SurfaceData } from './lib/surface';

/** The completed run for the condition we are *not* currently sweeping. */
function otherRun(
  running: Condition | null,
  reasoning: CurveResult | null,
  noReasoning: CurveResult | null,
): CurveResult | null {
  if (running === 'reasoning') return noReasoning;
  if (running === 'noreasoning') return reasoning;
  return null;
}

export default function App() {
  const [config, setConfig] = useState<RunConfig>(() => loadConfig());
  const [questions, setQuestions] = useState<Question[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [reasoningRun, setReasoningRun] = useState<CurveResult | null>(null);
  const [noReasoningRun, setNoReasoningRun] = useState<CurveResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGhost, setShowGhost] = useState(true);
  const [primaryCondition, setPrimaryCondition] = useState<Condition>('reasoning');
  const [exportFn, setExportFn] = useState<(() => void) | null>(null);
  const [partialFailures, setPartialFailures] = useState(0);
  /** Records streamed in so far by the sweep in flight. */
  const [liveRecords, setLiveRecords] = useState<Record_[]>([]);
  const [runningCondition, setRunningCondition] = useState<Condition | null>(null);
  /** When the last stream frame arrived, so a slow call is visibly still moving. */
  const [lastEventAt, setLastEventAt] = useState(0);
  const [retries, setRetries] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => saveConfig(config), [config]);

  useEffect(() => {
    fetch('/api/questions')
      .then((r) => r.json())
      .then((d: { questions: Question[] }) => setQuestions(d.questions))
      .catch(() => setQuestions([]));
  }, []);

  // Which run the surface shows. Falls back to whichever run exists, so a
  // single-run session still renders something.
  const active =
    primaryCondition === 'reasoning'
      ? (reasoningRun ?? noReasoningRun)
      : (noReasoningRun ?? reasoningRun);
  const ghostRun =
    active === reasoningRun ? noReasoningRun : active === noReasoningRun ? reasoningRun : null;

  const modelNames = useMemo<Record<ModelSlot, string>>(
    () => ({ A: config.modelA, B: config.modelB }),
    [config.modelA, config.modelB],
  );

  const isLive = phase === 'running';

  // Aggregate whatever has streamed in so far, so the surface grows while the
  // sweep runs instead of staying blank until it finishes.
  const liveAggregate = useMemo(
    () => (liveRecords.length > 0 ? aggregate(liveRecords, modelNames) : null),
    [liveRecords, modelNames],
  );

  const expectedSamples = useMemo(
    () => (questions.length ? Math.max(1, Math.round(questions.length / 10)) : 5),
    [questions.length],
  );

  const surfaceData = useMemo<SurfaceData | null>(() => {
    if (isLive) {
      // Show the in-flight sweep, falling back to a completed run only if
      // nothing has arrived yet.
      const base = liveAggregate ?? (active && active.condition === runningCondition ? active.aggregate : null);
      if (!base) {
        // Nothing measured yet: render the empty field of slots so the shape of
        // the run is visible immediately.
        return {
          aggregate: aggregate([], modelNames),
          crossover: { difficulty: null, gaps: [], none: true },
          ghost: otherRun(runningCondition, reasoningRun, noReasoningRun)?.aggregate ?? null,
          wasted: [],
          modelNames,
          live: true,
          expectedSamples,
        };
      }
      return {
        aggregate: base,
        crossover: { difficulty: null, gaps: [], none: true },
        ghost: otherRun(runningCondition, reasoningRun, noReasoningRun)?.aggregate ?? null,
        wasted: [],
        modelNames,
        live: true,
        expectedSamples,
      };
    }
    if (!active) return null;
    return {
      aggregate: active.aggregate,
      crossover: active.crossover,
      ghost: ghostRun ? ghostRun.aggregate : null,
      wasted: findWastedZone(active.aggregate),
      modelNames,
      live: false,
      expectedSamples,
    };
  }, [
    isLive,
    liveAggregate,
    active,
    runningCondition,
    reasoningRun,
    noReasoningRun,
    ghostRun,
    modelNames,
    expectedSamples,
  ]);

  const handleExportReady = useCallback((fn: (() => void) | null) => {
    setExportFn(() => fn);
  }, []);

  // A ticking clock, so a slow sweep visibly shows it is still working.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const startedAt = useRef<number>(0);
  useEffect(() => {
    if (phase === 'running' && startedAt.current === 0) startedAt.current = Date.now();
    if (phase !== 'running') startedAt.current = 0;
  }, [phase]);

  const elapsed = useMemo(() => {
    if (phase !== 'running' || startedAt.current === 0) return '';
    const secs = Math.max(0, Math.round((now - startedAt.current) / 1000));
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s`;
  }, [phase, now]);

  const measuredCells = useMemo(() => {
    if (!liveAggregate) return 0;
    return liveAggregate.cells.filter((c) => c.samples > 0).length;
  }, [liveAggregate]);

  // Seconds since the last stream frame. A real reasoning call can take a
  // minute or more, and during it the call counter does not move — so without
  // this the app looks frozen while it is in fact waiting on the provider.
  const sinceLastEvent = useMemo(() => {
    if (phase !== 'running' || lastEventAt === 0) return 0;
    return Math.max(0, Math.round((now - lastEventAt) / 1000));
  }, [phase, now, lastEventAt]);

  const inFlight = phase === 'running' && sinceLastEvent >= 3;

  const runSweep = useCallback(
    async (condition: Condition) => {
      if (!config.apiKey.trim()) {
        setPhase('error');
        setError(
          'No API key yet. Open Settings, paste your provider key, and start the sweep again.\n\n' +
            'The key is kept in this browser and sent with each request.',
        );
        setShowSettings(true);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setPhase('running');
      setError(null);
      setPartialFailures(0);
      setProgress({ done: 0, total: 100, current: '' });
      setLiveRecords([]);
      setRunningCondition(condition);
      setLastEventAt(Date.now());
      setRetries(0);

      // The button pressed decides the condition. Keep the Settings checkbox in
      // step with it, so the panel can never contradict the run in flight.
      const disableReasoning = condition === 'noreasoning';
      setConfig((prev) => ({ ...prev, disableReasoning }));

      try {
        const result = await startSweep(
          { config: { ...config, disableReasoning }, condition },
          {
            signal: controller.signal,
            onEvent: (event: SweepEvent) => {
              setLastEventAt(Date.now());
              if (event.type === 'start') {
                setProgress({ done: 0, total: event.total, current: '' });
              } else if (event.type === 'progress') {
                setProgress({
                  done: event.done,
                  total: event.total,
                  current: `${event.record.questionId} · model ${event.record.slot}`,
                });
                if (event.record.retried) setRetries((n) => n + 1);
                // Feed the surface as the data arrives.
                setLiveRecords((prev) => [...prev, event.record]);
              } else if (event.type === 'error') {
                setError(event.message);
              }
            },
          },
        );

        if (!result) throw new Error('The sweep ended without returning a result.');

        // A run where every call failed is not a result — it is an outage.
        // Showing it as a flat curve would be a confident lie.
        const failed = result.records.filter((r) => r.error);
        if (failed.length === result.records.length) {
          setPhase('error');
          setError(
            `All ${result.records.length} calls failed, so there is nothing to plot.\n\n` +
              `${failed[0]?.error ?? 'No error text was returned.'}`,
          );
          return;
        }
        setPartialFailures(failed.length);

        if (condition === 'reasoning') setReasoningRun(result);
        else setNoReasoningRun(result);
        setPhase('complete');
      } catch (err) {
        if (controller.signal.aborted) {
          setPhase(active ? 'complete' : 'idle');
          return;
        }
        setPhase('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [config, active],
  );

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase(active ? 'complete' : 'idle');
  };

  const hasBoth = Boolean(reasoningRun && noReasoningRun);

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1 className="masthead__title">
            The Confidence <em>Curve</em>
          </h1>
          <p className="masthead__sub">
            When is the extra thinking worth it? · {config.modelA} vs {config.modelB}
          </p>
        </div>
        <div className="masthead__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
          >
            Settings
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => exportFn?.()}
            disabled={!exportFn}
            title="Save the surface as a 2x PNG"
          >
            Export PNG
          </button>
          <button
            type="button"
            className="btn btn--signal"
            onClick={() => runSweep('noreasoning')}
            disabled={phase === 'running'}
            title="Run the same 50 questions with reasoning disabled"
          >
            Sweep · reasoning off
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => runSweep('reasoning')}
            disabled={phase === 'running'}
          >
            {phase === 'running' ? 'Sweeping…' : 'Sweep · reasoning on'}
          </button>
          {phase === 'running' ? (
            <button type="button" className="btn btn--ghost" onClick={stop}>
              Stop
            </button>
          ) : null}
        </div>
      </header>

      <main className="stage">
        <div className="stage__view">
          {surfaceData ? (
            <SurfaceView
              data={surfaceData}
              showGhost={showGhost}
              onToggleGhost={setShowGhost}
              onExportReady={handleExportReady}
              primary={primaryCondition}
              onPrimaryChange={setPrimaryCondition}
              hasBoth={hasBoth}
            />
          ) : null}

          {phase === 'idle' && !active ? <IdleState onOpenSettings={() => setShowSettings(true)} hasKey={Boolean(config.apiKey)} /> : null}

          {phase === 'running' ? (
            <div className="progress">
              <div className="progress__card">
                <div className="progress__head">
                  <span className="progress__title">
                    {runningCondition === 'noreasoning' ? 'Sweeping with reasoning off' : 'Sweeping with reasoning on'}
                  </span>
                  <span className="progress__count">
                    <b>{progress.done}</b> / {progress.total}
                  </span>
                </div>
                <div className="progress__bar">
                  <div
                    className="progress__fill"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="progress__meta">
                  <span>
                    {measuredCells} of 20 columns measured
                    {progress.current ? ` · last ${progress.current}` : ''}
                    {retries > 0 ? ` · ${retries} retried` : ''}
                  </span>
                  <span>
                    {inFlight ? `waiting on provider · ${sinceLastEvent}s` : elapsed}
                  </span>
                </div>
                {inFlight ? (
                  <p className="progress__note">
                    Each call is one question. A reasoning model can spend a minute or more on a
                    hard one before it answers — the counter moves when the answer lands.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {phase === 'complete' && partialFailures > 0 ? (
            <div className="progress">
              <p className="hint" style={{ color: 'var(--signal)', marginBottom: '0.35rem' }}>
                {partialFailures} of the model calls failed and were graded as incorrect. The curve
                below includes them.
              </p>
            </div>
          ) : null}

          {phase === 'error' && error ? (
            <div className="state">
              <div className="state__card">
                <h2 className="state__title">The sweep stopped</h2>
                <p className="state__body">
                  The provider's own error text is below, unedited.
                </p>
                <pre className="state__error">{error}</pre>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  <button type="button" className="btn" onClick={() => setShowSettings(true)}>
                    Open settings
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => runSweep('reasoning')}
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="stage__side">
          {showSettings ? (
            <Settings config={config} onChange={setConfig} onClose={() => setShowSettings(false)} />
          ) : null}

          {active ? (
            <Summary
              aggregate={active.aggregate}
              crossover={active.crossover}
              wasted={surfaceData?.wasted ?? []}
              modelNames={modelNames}
              condition={active.condition === 'reasoning' ? 'reasoning on' : 'reasoning off'}
            />
          ) : null}

          {hasBoth ? (
            <section className="panel">
              <div className="panel__head">
                <h2 className="panel__title">The reasoning tax</h2>
              </div>
              <table className="gaplist">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Reasoning on</th>
                    <th>Off</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(['A', 'B'] as ModelSlot[]).map((slot) => {
                    const on = reasoningRun?.aggregate.totals.find((t) => t.slot === slot);
                    const off = noReasoningRun?.aggregate.totals.find((t) => t.slot === slot);
                    if (!on || !off) return null;
                    const cost = on.accuracy - off.accuracy;
                    return (
                      <tr key={slot}>
                        <td>{slot}</td>
                        <td>{on.accuracy.toFixed(0)}%</td>
                        <td>{off.accuracy.toFixed(0)}%</td>
                        <td style={{ color: cost > 0 ? 'var(--signal)' : 'var(--dim)' }}>
                          {cost > 0 ? '−' : ''}
                          {Math.abs(cost).toFixed(0)} pts
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="hint" style={{ marginTop: '0.6rem' }}>
                Turning reasoning off drops every reasoning token to zero. What it costs in accuracy
                is the tax the extra thinking was paying.
              </p>
            </section>
          ) : null}

          {questions.length ? <Bank questions={questions} /> : null}

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Audit trail</h2>
            </div>
            <p className="hint">
              Every graded call is appended to <code>data/runs/&lt;runId&gt;.jsonl</code> — one line
              per question per model, with the raw answer, the stored answer and the verdict.
            </p>
            {active ? (
              <p className="hint" style={{ marginTop: '0.5rem', color: 'var(--brass)' }}>
                {active.runId}.jsonl · {active.records.length} records
              </p>
            ) : null}
          </section>

          <footer className="colophon">
            <p className="colophon__line">
              Built by{' '}
              <a href="https://harishkotra.me" target="_blank" rel="noreferrer noopener">
                Harish Kotra
              </a>
            </p>
            <p className="colophon__line">
              <a href="https://dailybuild.xyz" target="_blank" rel="noreferrer noopener">
                Checkout my other builds →
              </a>
            </p>
          </footer>
        </aside>
      </main>
    </div>
  );
}

function IdleState({ onOpenSettings, hasKey }: { onOpenSettings: () => void; hasKey: boolean }) {
  return (
    <div className="state">
      <div className="state__card">
        <h2 className="state__title">Nothing measured yet</h2>
        <p className="state__body">
          Run 50 questions — five at each difficulty from 1 to 10 — through both models. Every answer
          is graded in code against the stored answer bank, and the surface is built from what comes
          back.
        </p>
        {!hasKey ? (
          <p className="state__body" style={{ color: 'var(--brass)' }}>
            Start by adding your API key in Settings.
          </p>
        ) : null}
        <button type="button" className="btn" onClick={onOpenSettings}>
          Open settings
        </button>
      </div>
    </div>
  );
}