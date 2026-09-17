import { describe, expect, it } from 'vitest';
import { chapters } from '../../content/handbook';
import { filterChapters, splitMatches } from './filterChapters';

const summary = (query: string) =>
  filterChapters(chapters, query).map((m) => [m.chapter.number, m.chapterMatches, m.sections.map((s) => s.number)]);

describe('filterChapters', () => {
  it('returns everything for an empty query', () => {
    expect(filterChapters(chapters, '  ')).toHaveLength(chapters.length);
    expect(filterChapters(chapters, '')[0]!.sections).toHaveLength(13);
  });

  it('matches section titles case-insensitively', () => {
    expect(summary('distinct')).toEqual([['05', false, ['05.07']]]);
    expect(summary('NULL handling')).toEqual([['05', false, ['05.08']]]);
  });

  it('matches section numbers with or without the leading zero', () => {
    expect(summary('05.11')).toEqual([['05', false, ['05.11']]]);
    expect(summary('5.11')).toEqual([['05', false, ['05.11']]]);
    expect(summary('05.1')).toEqual([['05', false, ['05.10', '05.11', '05.12', '05.13']]]);
  });

  it('shows every section of a matching chapter', () => {
    const [match] = filterChapters(chapters, 'select statement');
    expect(match!.chapterMatches).toBe(true);
    expect(match!.sections).toHaveLength(13);
    expect(summary('chapter 5')[0]![1]).toBe(true);
    expect(summary('where clause')).toEqual([['06', true, []]]);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterChapters(chapters, 'sharding')).toEqual([]);
  });
});

describe('splitMatches', () => {
  it('marks every occurrence, preserving original casing', () => {
    expect(splitMatches('SELECT Without FROM', 'from')).toEqual([
      { text: 'SELECT Without ', match: false },
      { text: 'FROM', match: true },
    ]);
    expect(splitMatches('aXa', 'a')).toEqual([
      { text: 'a', match: true },
      { text: 'X', match: false },
      { text: 'a', match: true },
    ]);
    expect(splitMatches('Views', '')).toEqual([{ text: 'Views', match: false }]);
  });
});
