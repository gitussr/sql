import { describe, expect, it } from 'vitest';
import { parseExecutionSteps } from './executionOrder.ts';

describe('parseExecutionSteps', () => {
  it('parses numbered listings and "← note" highlights', () => {
    const steps = parseExecutionSteps(['1. FROM', '2. JOIN', '7. DISTINCT   ← Duplicate elimination occurs here', '9. LIMIT / FETCH / TOP'].join('\n'));
    expect(steps).toEqual([
      { label: 'FROM', highlighted: false },
      { label: 'JOIN', highlighted: false },
      { label: 'DISTINCT', note: 'Duplicate elimination occurs here', highlighted: true },
      { label: 'LIMIT / FETCH / TOP', highlighted: false },
    ]);
  });

  it('treats "(… here)" parentheticals as highlights but keeps other parentheticals in the label', () => {
    const steps = parseExecutionSteps('1. FROM\n6. SELECT (Projection occurs here)\n9. OFFSET / FETCH (or LIMIT / TOP)');
    expect(steps?.[1]).toEqual({ label: 'SELECT', note: 'Projection occurs here', highlighted: true });
    expect(steps?.[2]).toEqual({ label: 'OFFSET / FETCH (or LIMIT / TOP)', highlighted: false });
  });

  it('parses arrow flows with notes on their own line and indented arrows', () => {
    const steps = parseExecutionSteps('FROM\n↓\nWHERE\n        ↓\nSELECT\n← Expressions evaluated here\n↓\nORDER BY');
    expect(steps).toEqual([
      { label: 'FROM', highlighted: false },
      { label: 'WHERE', highlighted: false },
      { label: 'SELECT', note: 'Expressions evaluated here', highlighted: true },
      { label: 'ORDER BY', highlighted: false },
    ]);
  });

  it('keeps steps the author added, such as "Assign Variable"', () => {
    expect(parseExecutionSteps('SELECT\n↓\nAssign Variable')?.map((s) => s.label)).toEqual(['SELECT', 'Assign Variable']);
  });

  it('ignores written-order clause lists and other text', () => {
    expect(parseExecutionSteps('SELECT\nFROM\nWHERE\nGROUP BY')).toBeNull();
    expect(parseExecutionSteps('1. FROM')).toBeNull();
    expect(parseExecutionSteps('← orphan note\n↓\nFROM')).toBeNull();
    expect(parseExecutionSteps('')).toBeNull();
  });
});
