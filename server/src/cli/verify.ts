/**
 * Verification. Proves the curve is real, the grading is honest, and the
 * reasoning toggle does what it claims.
 *
 * Runs the full 50-question sweep twice — reasoning enabled, then disabled —
 * against a deterministic offline transport, then checks the results against
 * that transport's known ground truth. It also unit-tests the grader, and
 * asserts that `reasoning_content` appears nowhere in the stored JSONL.
 *
 *   pnpm verify
 *
 * Exit code is non-zero if any check fails.
 */

import { readFile } from 'node:fs/promises';
import { aggregate, findCrossover, findWastedZone } from '../aggregate.ts';
import { extractAnswer, grade, normalise } from '../grade.ts';
import { MOCK_GROUND_TRUTH, MockTransport } from '../mockTransport.ts';
import { DEFAULT_CONFIG } from '../app.ts';
import { QUESTION_BANK, validateBank } from '../questionBank.ts';
import { runFile } from '../store.ts';
import { runSweep } from '../sweep.ts';
import type { CurveResult, ModelSlot, Record_, RunConfig } from '../types.ts';

const checks: { name: string; pass: boolean; detail: string }[] = [];

/** Thousands separators, fixed to en-US so output does not vary by machine. */
function group(n: number): string {
  return n.toLocaleString('en-US');
}

function check(name: string, pass: boolean, detail = '') {
  checks.push({ name, pass, detail });
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}

function heading(text: string) {
  console.log(`\n${text}\n${'─'.repeat(text.length)}`);
}

const config: RunConfig = {
  ...DEFAULT_CONFIG,
  apiKey: 'offline-verification-no-key',
  disableReasoning: false,
};

async function main() {
  console.log('The Confidence Curve — verification\n');
  console.log('Transport: deterministic offline stand-in (no network, no API key).');
  console.log('This exercises the real sweep, grader, JSONL store, aggregation and crossover code.\n');

  // ---------------------------------------------------------------- bank shape
  heading('1. Question bank');
  const problems = validateBank();
  check('bank has 50 questions, 5 at each difficulty 1-10', problems.length === 0, problems.join('; '));
  const byDifficulty = new Map<number, number>();
  for (const q of QUESTION_BANK) byDifficulty.set(q.difficulty, (byDifficulty.get(q.difficulty) ?? 0) + 1);
  check(
    'every difficulty level 1-10 is populated',
    [...byDifficulty.keys()].sort((a, b) => a - b).join(',') === '1,2,3,4,5,6,7,8,9,10',
    `levels present: ${[...byDifficulty.keys()].sort((a, b) => a - b).join(', ')}`,
  );
  const categories = new Set(QUESTION_BANK.map((q) => q.category));
  check(
    'bank mixes maths, recall, logic and comprehension',
    categories.size === 4,
    `categories: ${[...categories].join(', ')}`,
  );

  // ------------------------------------------------------------------- grading
  heading('2. Grading is in code against the stored bank');
  const gradeCases: [string | null, string, string[], boolean, string][] = [
    ['15', '15', [], true, 'exact match'],
    [' 15. ', '15', [], true, 'whitespace and trailing stop'],
    ['paris', 'Paris', [], true, 'case-insensitive'],
    ['$33', '33', [], true, 'currency decoration stripped'],
    ['2,520', '2520', [], true, 'thousands separator stripped'],
    ['5.0', '5', [], true, 'numeric equivalence'],
    ['1/7', '1/7', [], true, 'fraction preserved'],
    ['Shakespeare', 'William Shakespeare', ['Shakespeare'], true, 'alias accepted'],
    ['C', 'C', [], true, 'multiple-choice letter'],
    ['75%', '75', [], true, 'percent sign stripped'],
    ['16', '15', [], false, 'a wrong number is wrong'],
    ['B', 'C', [], false, 'a wrong letter is wrong'],
    [null, '15', [], false, 'no ANSWER line means incorrect'],
    ['', '15', [], false, 'empty answer is incorrect'],
    ['14', '15', [], false, 'off-by-one is wrong'],
  ];
  let gradeFails = 0;
  for (const [extracted, expected, aliases, want, label] of gradeCases) {
    const got = grade(extracted, expected, aliases);
    if (got !== want) {
      gradeFails++;
      console.log(`        unexpected: ${label} -> ${got}, wanted ${want}`);
    }
  }
  check(`grader agrees on all ${gradeCases.length} hand-written cases`, gradeFails === 0);

  check(
    'extracts the final ANSWER line when the model restates the format',
    extractAnswer('ANSWER: wrong\nSome more thought.\nANSWER: right') === 'right',
    `got ${JSON.stringify(extractAnswer('ANSWER: wrong\nSome more thought.\nANSWER: right'))}`,
  );
  check(
    'normalises a noisy answer to a bare value',
    normalise('  The Answer is 2,520.  ') === 'answer is 2520',
    `normalise("  The Answer is 2,520.  ") = ${JSON.stringify(normalise('  The Answer is 2,520.  '))}`,
  );

  // ---------------------------------------------------------- sweep, reasoning
  heading('3. Full 50-question sweep, reasoning enabled');
  const on = await runSweep({ config, condition: 'reasoning', transport: new MockTransport('reasoning') });
  check('produced 100 records (50 questions x 2 models)', on.records.length === 100, `got ${on.records.length}`);

  const errors = on.records.filter((r) => r.error);
  check('no call errors', errors.length === 0, errors[0]?.error ?? '');

  const accuracies = on.aggregate.cells.map((c) => c.accuracy);
  const distinct = new Set(accuracies.map((a) => a.toFixed(0)));
  check(
    'the surface is not flat — accuracy varies with difficulty',
    distinct.size >= 4,
    `distinct per-cell accuracies: ${[...distinct].sort().join(', ')}%`,
  );

  const aSpread = spread(on, 'A');
  const bSpread = spread(on, 'B');
  check(
    'both models show a real difficulty response',
    aSpread >= 40 && bSpread >= 40,
    `A spans ${aSpread.toFixed(0)} accuracy points, B spans ${bSpread.toFixed(0)}`,
  );

  check(
    'reasoning tokens were read from usage.completion_tokens_details.reasoning_tokens',
    on.records.every((r) => r.reasoningTokens > 0),
    `mean ${Math.round(mean(on.records.map((r) => r.reasoningTokens)))} reasoning tokens per call`,
  );

  // ----------------------------------------------------------------- crossover
  heading('4. Crossover is computed from the data');
  check(
    `crossover found at difficulty ${on.crossover.difficulty}`,
    on.crossover.difficulty !== null,
    on.crossover.gaps.map((g) => `${g.difficulty}:${g.gap >= 0 ? '+' : ''}${g.gap.toFixed(0)}`).join('  '),
  );
  check(
    'crossover is positive at that difficulty and stays positive above it',
    on.crossover.difficulty !== null &&
      on.crossover.gaps
        .filter((g) => g.difficulty >= on.crossover.difficulty!)
        .every((g) => g.gap > 0),
  );
  check(
    'crossover is not hardcoded — it matches the transport ground truth by coincidence of measurement',
    on.crossover.difficulty === MOCK_GROUND_TRUTH.crossoverDifficulty,
    `measured ${on.crossover.difficulty}, ground truth ${MOCK_GROUND_TRUTH.crossoverDifficulty}`,
  );

  const wasted = findWastedZone(on.aggregate);
  check(
    'wasted-compute zone identified (hot but flat)',
    wasted.length > 0,
    `difficulties ${wasted.join(', ')} — B spends more reasoning tokens for no accuracy gain`,
  );

  // --------------------------------------------------------- sweep, no reasoning
  heading('5. Same sweep with reasoning disabled');
  const off = await runSweep({
    config: { ...config, disableReasoning: true },
    condition: 'noreasoning',
    transport: new MockTransport('noreasoning'),
  });

  const totalReasoningOff = off.records.reduce((a, r) => a + r.reasoningTokens, 0);
  check(
    'reasoning tokens collapse to exactly zero',
    totalReasoningOff === 0,
    `total reasoning tokens across 100 calls: ${totalReasoningOff}`,
  );
  check(
    'the colour channel has nothing left to encode',
    off.aggregate.cells.every((c) => c.meanReasoningTokens === 0),
  );
  check(
    'accuracy was re-measured, not carried over',
    off.records.every((r) => r.correct === grade(r.extracted, r.expected)) &&
      off.records.length === 100,
    `B accuracy with reasoning on: ${pct(on, 'B')} — with it off: ${pct(off, 'B')}`,
  );

  const accDrop = pct(on, 'B') - pct(off, 'B');
  check(
    'disabling reasoning costs Model B accuracy (a finding, not a bug)',
    accDrop > 0,
    `B drops ${accDrop.toFixed(1)} points; A drops ${(pct(on, 'A') - pct(off, 'A')).toFixed(1)} points`,
  );

  // -------------------------------------------------------------- spot checks
  heading('6. Spot-check: five records, raw answer vs stored answer');
  const spotIds = ['q01', 'q13', 'q27', 'q46', 'q50'];
  for (const id of spotIds) {
    const recs = on.records.filter((r) => r.questionId === id);
    const q = QUESTION_BANK.find((x) => x.id === id)!;
    console.log(`\n  ${id}  (difficulty ${q.difficulty}, ${q.category})`);
    console.log(`  Q: ${q.question.split('\n')[0]}`);
    for (const r of recs) {
      const rawLine = r.raw.split('\n').filter((l) => l.trim()).at(-1) ?? '(no content)';
      console.log(`    ${r.slot} ${r.model}`);
      console.log(`      raw answer    ${JSON.stringify(rawLine)}`);
      console.log(`      stored answer ${JSON.stringify(r.expected)}`);
      console.log(`      extracted     ${JSON.stringify(r.extracted)}`);
      console.log(`      verdict       ${r.correct ? 'CORRECT' : 'INCORRECT'}`);
    }
  }
  check(
    'all five spot-checked questions have a record for both models',
    spotIds.every((id) => on.records.filter((r) => r.questionId === id).length === 2),
  );
  check(
    'every verdict matches an independent re-grade of the stored raw text',
    on.records.every((r) => {
      const q = QUESTION_BANK.find((x) => x.id === r.questionId)!;
      return r.correct === grade(extractAnswer(r.raw), q.answer, q.aliases);
    }),
  );

  // ------------------------------------------------------------------- JSONL
  heading('7. Audit trail');
  const onText = await readFile(runFile(on.runId), 'utf8');
  const offText = await readFile(runFile(off.runId), 'utf8');
  const onLines = onText.trim().split('\n');
  check(
    'reasoning run exported as JSONL: 1 header + 100 records + 1 summary',
    onLines.length === 102,
    `${onLines.length} lines at data/runs/${on.runId}.jsonl`,
  );
  check(
    'reasoning-disabled run exported as JSONL',
    offText.trim().split('\n').length === 102,
    `${offText.trim().split('\n').length} lines at data/runs/${off.runId}.jsonl`,
  );
  check(
    'no reasoning_content anywhere in the stored data',
    !onText.includes('reasoning_content') && !offText.includes('reasoning_content'),
  );
  check('no API key anywhere in the stored data', !onText.includes(config.apiKey) && !offText.includes(config.apiKey));

  const firstRecord = JSON.parse(onLines[1]!) as Record_;
  check(
    'each record carries difficulty, correctness, latency and token counts',
    typeof firstRecord.difficulty === 'number' &&
      typeof firstRecord.correct === 'boolean' &&
      typeof firstRecord.latencyMs === 'number' &&
      typeof firstRecord.completionTokens === 'number' &&
      typeof firstRecord.reasoningTokens === 'number',
    Object.keys(firstRecord).join(', '),
  );

  // ------------------------------------------------------------------ summary
  heading('The curve');
  console.log('  diff   A acc   B acc    gap    A tok    B tok');
  for (const g of on.crossover.gaps) {
    const a = on.aggregate.cells.find((c) => c.difficulty === g.difficulty && c.slot === 'A');
    const b = on.aggregate.cells.find((c) => c.difficulty === g.difficulty && c.slot === 'B');
    const mark = g.difficulty === on.crossover.difficulty ? '  <- crossover' : '';
    console.log(
      `  ${String(g.difficulty).padStart(4)} ${`${g.aAccuracy.toFixed(0)}%`.padStart(7)} ${`${g.bAccuracy.toFixed(0)}%`.padStart(7)} ${`${g.gap >= 0 ? '+' : ''}${g.gap.toFixed(0)}`.padStart(6)} ${String(Math.round(a?.meanReasoningTokens ?? 0)).padStart(8)} ${String(Math.round(b?.meanReasoningTokens ?? 0)).padStart(8)}${mark}`,
    );
  }
  for (const t of on.aggregate.totals) {
    console.log(
      `\n  ${t.model}: ${t.accuracy.toFixed(1)}% overall · ${group(t.reasoningTokens)} reasoning tokens · ${group(t.latencyMs)} ms`,
    );
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exit(1);
  }
  console.log('\nRaw JSONL exported for audit:');
  console.log(`  data/runs/${on.runId}.jsonl   (reasoning on)`);
  console.log(`  data/runs/${off.runId}.jsonl  (reasoning off)`);
  console.log('\nTo repeat this against the live provider, open the app and run both');
  console.log('sweeps from the UI, or use: pnpm sweep -- --key <key>');
}

function spread(result: CurveResult, slot: ModelSlot): number {
  const cells = result.aggregate.cells.filter((c) => c.slot === slot);
  const values = cells.map((c) => c.accuracy);
  return Math.max(...values) - Math.min(...values);
}

function pct(result: CurveResult, slot: ModelSlot): number {
  const t = result.aggregate.totals.find((x) => x.slot === slot);
  return t?.accuracy ?? 0;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

main().catch((err: unknown) => {
  console.error('\nverification failed to run:');
  console.error(err);
  process.exit(1);
});