/** The SSE client for POST /api/curve. */

import type { Condition, CurveResult, RunConfig, SweepEvent } from './types';

export interface SweepRequest {
  config: RunConfig;
  condition: Condition;
  questionIds?: string[];
}

export interface SweepHandlers {
  onEvent: (event: SweepEvent) => void;
  signal?: AbortSignal;
}

/**
 * POST the sweep and read the SSE stream.
 *
 * EventSource cannot POST, so this reads the response body directly and parses
 * the event stream by hand.
 */
export async function startSweep(request: SweepRequest, handlers: SweepHandlers): Promise<CurveResult | null> {
  const { config, condition, questionIds } = request;
  const response = await fetch('/api/curve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: handlers.signal,
    body: JSON.stringify({
      condition,
      questionIds,
      apiKey: config.apiKey,
      config: {
        baseUrl: config.baseUrl,
        modelA: config.modelA,
        modelB: config.modelB,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        disableReasoning: condition === 'noreasoning' || config.disableReasoning,
      },
    }),
  });

  if (!response.ok) {
    // The route returns a plain JSON error before it opens a stream.
    const text = await response.text();
    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      if (text.trim()) message = text.trim();
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error('The server returned no response body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: CurveResult | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;

      let event: SweepEvent;
      try {
        event = JSON.parse(data) as SweepEvent;
      } catch {
        continue;
      }
      handlers.onEvent(event);
      if (event.type === 'done') result = event.result;
      if (event.type === 'error') streamError = event.message;
    }
  }

  if (streamError) throw new Error(streamError);
  return result;
}