import { describe, expect, it } from 'vitest';
import { canHighlight, highlightCode, segmentText } from './highlight.ts';

describe('highlightCode', () => {
  it('tokenises SQL into compact segments', () => {
    expect(highlightCode("SELECT COUNT(*) AS total -- rows\nFROM Orders WHERE price > 10.5 AND name = 'a';", 'sql')).toEqual([
      ['SELECT', 'k'],
      ' ',
      ['COUNT', 'f'],
      ['(', 'p'],
      ['*', 'o'],
      [')', 'p'],
      ' ',
      ['AS', 'k'],
      ' total ',
      ['-- rows', 'c'],
      '\n',
      ['FROM', 'k'],
      ' Orders ',
      ['WHERE', 'k'],
      ' price ',
      ['>', 'o'],
      ' ',
      ['10.5', 'n'],
      ' ',
      ['AND', 'k'],
      ' name ',
      ['=', 'o'],
      ' ',
      ["'a'", 's'],
      [';', 'p'],
    ]);
  });

  it('merges adjacent segments of the same kind', () => {
    const segments = highlightCode('SELECT\n\n  1', 'sql');
    expect(segments.filter((s) => typeof s === 'string')).toEqual(['\n\n  ']);
  });

  it('reproduces the source text exactly', () => {
    const source = '{\n  "id": "05.08",\n  "keywords": ["NULL", true, 3]\n}';
    expect(highlightCode(source, 'json').map(segmentText).join('')).toBe(source);
  });

  it('knows which languages have grammars', () => {
    expect(['sql', 'SQL', 'json', 'ts', 'http', 'python', 'c', 'md'].every(canHighlight)).toBe(true);
    expect([undefined, null, '', 'text', 'plaintext', 'mermaid'].some(canHighlight)).toBe(false);
  });
});
