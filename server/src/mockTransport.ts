/**
 * A deterministic, offline stand-in for the provider.
 *
 * This exists so the whole pipeline — sweep, grading, JSONL, aggregation,
 * crossover — can be exercised end to end without an API key, and so the
 * crossover computation can be tested against a known ground truth.
 *
 * It is NOT a model. It is a scripted responder with a fixed competence curve:
 * Model A is stronger at low difficulty, Model B overtakes it as difficulty
 * rises, and B's reasoning-token spend climbs steeply with difficulty while A's
 * stays low. If the app is wired correctly, the surface must show that shape.
 *
 * Nothing here is used when a real base URL is configured: the HTTP transport
 * is the default, and this is only reachable from the CLI verification script.
 */

import { QUESTION_BANK, getQuestion } from './questionBank.ts';
import type { RunConfig } from './types.ts';
import type { CallResult, Transport } from './provider.ts';

/** Ground truth the verification script checks the app against. */
export const MOCK_GROUND_TRUTH = {
  /** Below this difficulty A wins or ties; at and above it B wins. */
  crossoverDifficulty: 6,
  /** B's reasoning-token premium starts climbing from here. */
  reasoningRampFrom: 5,
};

/** Deterministic 0..1 hash of a string, so a given call always behaves the same. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Probability that `slot` answers a question of `difficulty` correctly. */
function competence(slot: 'A' | 'B', difficulty: number, reasoningDisabled: boolean): number {
  const d = difficulty;
  let p: number;
  if (slot === 'A') {
    // Strong early, degrades steadily, collapses at the top end.
    p = 1.02 - 0.085 * (d - 1);
    // A barely leans on deliberation, so switching it off costs it little.
    if (reasoningDisabled) p -= 0.04;
  } else {
    // Weaker early, overtakes A around difficulty 6, strong at the top end.
    p = 0.55 + 0.045 * (d - 1);
    // B's advantage is bought with deliberation: switching it off costs B a lot.
    if (reasoningDisabled) p -= 0.18;
  }
  return clamp(p, 0.05, 0.99);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Reasoning tokens the mock reports, from the mandated usage location. */
function mockReasoningTokens(slot: 'A' | 'B', difficulty: number, disabled: boolean): number {
  if (disabled) return 0;
  if (slot === 'A') return Math.round(40 + difficulty * 12);
  // B thinks much harder as difficulty climbs — the reasoning tax.
  const ramp = Math.max(0, difficulty - MOCK_GROUND_TRUTH.reasoningRampFrom);
  return Math.round(120 + difficulty * 55 + ramp * ramp * 90);
}

export class MockTransport implements Transport {
  /** Set by the CLI so the verification report can show which condition ran. */
  constructor(private readonly label = 'mock') {}

  async call(model: string, question: string, config: RunConfig, _maxTokens: number): Promise<CallResult> {
    const slot: 'A' | 'B' = model === config.modelB ? 'B' : 'A';

    const match = QUESTION_BANK.find((q) => q.question === question);
    if (!match) {
      throw new Error(`MockTransport received an unknown question: ${question.slice(0, 60)}…`);
    }

    const p = competence(slot, match.difficulty, config.disableReasoning);
    // The roll deliberately excludes the condition, so switching reasoning off
    // can only ever turn a correct answer into an incorrect one — the same
    // monotone relationship a real reasoning toggle produces.
    const roll = hash(`${model}|${match.id}`);
    const answersCorrectly = roll < p;

    const answer = answersCorrectly ? match.answer : wrongAnswerFor(match.id, match.answer);

    const reasoning = mockReasoningTokens(slot, match.difficulty, config.disableReasoning);
    const completion = reasoning + 25 + Math.round(hash(`c|${model}|${match.id}`) * 40);
    const latency = 300 + reasoning * 2.4 + Math.round(hash(`l|${model}|${match.id}`) * 400);

    // A plausible response body. Note there is no reasoning_content anywhere:
    // the mock reports only the token count, matching the app's contract.
    const body = {
      id: `mock-${match.id}-${slot}`,
      object: 'chat.completion',
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `Working through it.\n\nANSWER: ${answer}`,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 60 + match.question.length,
        completion_tokens: completion,
        total_tokens: 60 + match.question.length + completion,
        completion_tokens_details: { reasoning_tokens: reasoning },
      },
    };

    // Round-trip through JSON so the mock exercises the same parsing path as HTTP.
    const parsed = JSON.parse(JSON.stringify(body)) as {
      choices: { message: { content: string } }[];
      usage: Record<string, unknown>;
    };

    return {
      content: parsed.choices[0]!.message.content,
      latencyMs: latency,
      promptTokens: Number(parsed.usage['prompt_tokens'] ?? 0),
      completionTokens: Number(parsed.usage['completion_tokens'] ?? 0),
      reasoningTokens: readMockReasoning(parsed.usage),
      retried: false,
    };
  }
}

function readMockReasoning(usage: Record<string, unknown>): number {
  const details = usage['completion_tokens_details'] as Record<string, unknown> | undefined;
  const rt = details?.['reasoning_tokens'];
  return typeof rt === 'number' ? rt : 0;
}

/** A deterministic wrong answer, so the mock is wrong in a realistic way. */
function wrongAnswerFor(id: string, correct: string): string {
  const q = getQuestion(id);
  if (!q) return 'unknown';
  if (/^-?\d+(\.\d+)?$/.test(correct)) {
    const n = Number(correct);
    const delta = hash(`w|${id}`) < 0.5 ? 1 : -1;
    return String(n + delta * (n > 20 ? 3 : 1));
  }
  const letters = ['A', 'B', 'C', 'D'];
  if (letters.includes(correct)) {
    return letters.find((l) => l !== correct) ?? 'A';
  }
  return `${correct}ish`;
}