/**
 * Grading. Deterministic, in code, against the stored answer bank.
 *
 * No model ever grades another model: we extract the model's `ANSWER:` line
 * and compare it to the stored answer after normalisation.
 */

/** Pull the final `ANSWER: <value>` line out of a response. */
export function extractAnswer(raw: string): string | null {
  if (!raw) return null;
  // Prefer the last ANSWER: line — the system prompt asks for it to be final,
  // and a model that restates the format earlier should be judged on its last word.
  const matches = [...raw.matchAll(/^\s*ANSWER\s*:\s*(.+?)\s*$/gim)];
  const last = matches.at(-1);
  if (last?.[1]) return last[1].trim();

  // Fallback: an inline "ANSWER: x" that is not on its own line.
  const inline = [...raw.matchAll(/ANSWER\s*:\s*([^\n]+)/gi)].at(-1);
  if (inline?.[1]) return inline[1].trim();
  return null;
}

/**
 * Normalise a candidate answer for comparison.
 *
 * Handles the surface variation that is not a difference in knowledge:
 * case, surrounding whitespace, punctuation, thousands separators, currency
 * symbols, a leading "the", and a trailing full stop.
 */
export function normalise(value: string): string {
  let s = value.trim().toLowerCase();

  // Drop a wrapping code span or quotes.
  s = s.replace(/^[`"']+|[`"']+$/g, '').trim();

  // A trailing explanation after a full stop: keep the first sentence only.
  s = s.split('\n')[0] ?? s;

  // Strip currency and percent decoration.
  s = s.replace(/[$£€]/g, '');
  s = s.replace(/%/g, '');

  // Thousands separators inside numbers: 2,520 -> 2520
  s = s.replace(/(\d),(?=\d{3}\b)/g, '$1');

  // Drop a leading article.
  s = s.replace(/^(the|a|an)\s+/, '');

  // Remove punctuation except digits, letters, and the fraction slash.
  s = s.replace(/[.,;:!?"'`()\[\]{}]/g, ' ');

  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim();

  // Drop trailing units words that do not change the value.
  s = s.replace(/\s+(days?|hours?|minutes?|seconds?|km\/h|km|m|cm|degrees?|dollars?|cents?|percent)$/, '');

  return s.trim();
}

/** Compare an extracted answer to the stored answer (and its aliases). */
export function grade(extracted: string | null, expected: string, aliases: string[] = []): boolean {
  if (extracted === null) return false;
  const got = normalise(extracted);
  if (!got) return false;
  const accepted = [expected, ...aliases].map(normalise);
  if (accepted.includes(got)) return true;

  // Numeric equivalence: "5" matches "5.0", "1/7" stays literal.
  const gotNum = toNumber(got);
  if (gotNum !== null) {
    for (const a of accepted) {
      const aNum = toNumber(a);
      if (aNum !== null && Math.abs(aNum - gotNum) < 1e-9) return true;
    }
  }

  // A model that answers with the value plus a short trailing clause, e.g.
  // "2691 (smallest such number)" — accept when a single accepted answer is
  // the whole leading token run.
  for (const a of accepted) {
    if (a && (got === a || got.startsWith(a + ' ') || got.endsWith(' ' + a))) return true;
  }
  return false;
}

function toNumber(s: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}