/**
 * Run a sweep from the terminal and print the resulting curve.
 *
 *   pnpm sweep -- --key sk-... [--condition reasoning|noreasoning]
 *               [--base-url ...] [--model-a ...] [--model-b ...]
 *               [--temperature 0] [--max-tokens 1600] [--disable-reasoning]
 *
 * The key may also come from PARTICLE_API_KEY, which keeps it out of shell
 * history. No key is ever written to disk by this script.
 */

import { aggregate, findCrossover, findWastedZone } from '../aggregate.ts';
import { DEFAULT_CONFIG } from '../app.ts';
import { HttpTransport } from '../provider.ts';
import { runSweep } from '../sweep.ts';
import type { Condition, ModelSlot, RunConfig } from '../types.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const disableReasoning = flag('disable-reasoning');
  const condition: Condition =
    (arg('condition') as Condition | undefined) ?? (disableReasoning ? 'noreasoning' : 'reasoning');

  const config: RunConfig = {
    baseUrl: arg('base-url') ?? DEFAULT_CONFIG.baseUrl,
    apiKey: arg('key') ?? process.env['PARTICLE_API_KEY'] ?? '',
    modelA: arg('model-a') ?? DEFAULT_CONFIG.modelA,
    modelB: arg('model-b') ?? DEFAULT_CONFIG.modelB,
    temperature: arg('temperature') !== undefined ? Number(arg('temperature')) : DEFAULT_CONFIG.temperature,
    maxTokens: arg('max-tokens') !== undefined ? Number(arg('max-tokens')) : DEFAULT_CONFIG.maxTokens,
    disableReasoning: disableReasoning || condition === 'noreasoning',
  };

  if (!config.apiKey) {
    console.error(
      'No API key. Pass --key sk-... or set PARTICLE_API_KEY.\n' +
        'To exercise the pipeline without a key, run: pnpm verify',
    );
    process.exit(1);
  }

  console.log(`Sweeping ${config.modelA} vs ${config.modelB} (${condition})`);
  console.log(`  base url   ${config.baseUrl}`);
  console.log(`  temperature ${config.temperature}  max tokens ${config.maxTokens}`);
  console.log(`  reasoning  ${config.disableReasoning ? 'disabled' : 'enabled'}\n`);

  let last = 0;
  const result = await runSweep({
    config,
    condition,
    transport: new HttpTransport(),
    onEvent: (event) => {
      if (event.type !== 'progress') return;
      const r = event.record;
      if (event.done - last >= 10 || event.done === event.total) {
        last = event.done;
        process.stdout.write(`  ${event.done}/${event.total} records\n`);
      }
      if (r.error) console.error(`  ! ${r.questionId} ${r.slot}: ${r.error.split('\n')[0]}`);
    },
  });

  const modelNames: Record<ModelSlot, string> = { A: config.modelA, B: config.modelB };
  const agg = aggregate(result.records, modelNames);
  const crossover = findCrossover(agg);
  const wasted = findWastedZone(agg);

  console.log(`\nrun ${result.runId}  ->  data/runs/${result.runId}.jsonl\n`);
  console.log('diff   A acc   B acc    gap   A tok   B tok   n');
  for (const g of crossover.gaps) {
    const a = agg.cells.find((c) => c.difficulty === g.difficulty && c.slot === 'A');
    const b = agg.cells.find((c) => c.difficulty === g.difficulty && c.slot === 'B');
    console.log(
      [
        String(g.difficulty).padStart(4),
        `${g.aAccuracy.toFixed(0)}%`.padStart(7),
        `${g.bAccuracy.toFixed(0)}%`.padStart(7),
        `${g.gap >= 0 ? '+' : ''}${g.gap.toFixed(0)}`.padStart(6),
        String(Math.round(a?.meanReasoningTokens ?? 0)).padStart(7),
        String(Math.round(b?.meanReasoningTokens ?? 0)).padStart(7),
        String(a?.samples ?? 0).padStart(4),
      ].join(' '),
    );
  }

  console.log(
    `\ncrossover difficulty: ${crossover.difficulty ?? 'none — B never sustains an advantage'}`,
  );
  if (wasted.length) console.log(`wasted-compute zone (hot but flat): difficulties ${wasted.join(', ')}`);
  for (const t of agg.totals) {
    console.log(
      `${t.model}: ${t.accuracy.toFixed(1)}% overall, ${t.reasoningTokens.toLocaleString()} reasoning tokens, ${(t.latencyMs / 1000).toFixed(0)}s total latency`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});