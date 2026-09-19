/**
 * JSONL persistence. Every (question x model) record is appended to a run
 * file so the whole curve is auditable line by line.
 */

import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Condition, Record_ } from './types.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RUNS_DIR = path.resolve(HERE, '../../data/runs');

export async function ensureRunsDir(): Promise<void> {
  if (!existsSync(RUNS_DIR)) await mkdir(RUNS_DIR, { recursive: true });
}

export function runFile(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.jsonl`);
}

export async function initRunFile(runId: string, header: Record<string, unknown>): Promise<void> {
  await ensureRunsDir();
  await writeFile(runFile(runId), JSON.stringify({ kind: 'run', ...header }) + '\n', 'utf8');
}

export async function appendRecord(record: Record_): Promise<void> {
  await ensureRunsDir();
  await appendFile(runFile(record.runId), JSON.stringify(record) + '\n', 'utf8');
}

export async function appendSummary(runId: string, summary: Record<string, unknown>): Promise<void> {
  await appendFile(runFile(runId), JSON.stringify({ kind: 'summary', ...summary }) + '\n', 'utf8');
}

export async function readRun(runId: string): Promise<Record_[]> {
  const file = runFile(runId);
  if (!existsSync(file)) return [];
  const text = await readFile(file, 'utf8');
  const out: Record_[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed['kind']) continue; // header or summary line
      out.push(parsed as unknown as Record_);
    } catch {
      // Skip a torn final line rather than failing the whole read.
    }
  }
  return out;
}

export interface RunIndexEntry {
  runId: string;
  condition: Condition;
  records: number;
  at: string;
}

export async function listRuns(): Promise<RunIndexEntry[]> {
  await ensureRunsDir();
  const files = (await readdir(RUNS_DIR)).filter((f) => f.endsWith('.jsonl'));
  const out: RunIndexEntry[] = [];
  for (const f of files) {
    const runId = f.replace(/\.jsonl$/, '');
    const records = await readRun(runId);
    const first = records[0];
    out.push({
      runId,
      condition: first?.condition ?? 'reasoning',
      records: records.length,
      at: first?.at ?? '',
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}