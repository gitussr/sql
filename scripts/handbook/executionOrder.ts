import type { ExecutionStep } from '../../src/content/types.ts';

/**
 * Parses an authored logical-execution-order listing into steps.
 *
 * Two authored formats are recognised:
 *
 *   Numbered            Arrow flow
 *   1. FROM             FROM
 *   2. JOIN             ↓
 *   6. SELECT ← note    SELECT
 *                       ← note
 *
 * A step is highlighted when the author annotated it with "← note" or with a
 * parenthetical that points at it ("SELECT (Projection occurs here)").
 * Anything else (for example a plain list of clauses in *written* order)
 * returns null and stays an ordinary code block.
 */
export function parseExecutionSteps(text: string): ExecutionStep[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const numbered = lines.map((line) => line.match(/^\d+\.\s+(.+)$/));
  if (numbered.every(Boolean)) {
    return lines.length >= 2 ? numbered.map((match) => toStep(match![1]!)) : null;
  }

  if (!lines.some(isArrow)) return null;
  const steps: ExecutionStep[] = [];
  for (const line of lines) {
    if (isArrow(line)) continue;
    if (line.startsWith('←')) {
      const previous = steps.at(-1);
      if (!previous || previous.note) return null;
      previous.note = line.slice(1).trim();
      previous.highlighted = true;
      continue;
    }
    steps.push(toStep(line));
  }
  return steps.length >= 2 ? steps : null;
}

function isArrow(line: string): boolean {
  return line === '↓';
}

function toStep(raw: string): ExecutionStep {
  const arrow = raw.indexOf('←');
  if (arrow !== -1) {
    return { label: raw.slice(0, arrow).trim(), note: raw.slice(arrow + 1).trim(), highlighted: true };
  }
  const pointer = raw.match(/^(.*?)\s*\(([^()]*\bhere\b[^()]*)\)$/i);
  if (pointer) {
    return { label: pointer[1]!.trim(), note: pointer[2]!.trim(), highlighted: true };
  }
  return { label: raw.trim(), highlighted: false };
}
