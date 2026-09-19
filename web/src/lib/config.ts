/** Config persistence. The API key lives only in this browser's localStorage. */

import type { RunConfig } from './types';

const KEY = 'confidence-curve.config.v1';

export const DEFAULT_CONFIG: RunConfig = {
  baseUrl: 'https://api.particle.ai/v1',
  apiKey: '',
  modelA: 'deepseek-v4-flash-0731',
  modelB: 'deepseek-v4.1-flash',
  temperature: 0,
  maxTokens: 1600,
  disableReasoning: false,
};

export function loadConfig(): RunConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<RunConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      // Never let a malformed stored value break a sweep.
      temperature: numberOr(parsed.temperature, DEFAULT_CONFIG.temperature),
      maxTokens: numberOr(parsed.maxTokens, DEFAULT_CONFIG.maxTokens),
      disableReasoning: Boolean(parsed.disableReasoning),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: RunConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // A full or blocked localStorage should not break the app.
  }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}