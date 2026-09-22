import { describe, expect, it } from 'vitest';
import { chapters } from './handbook';
import {
  adjacentEntries,
  chapterPath,
  entryKey,
  entryLabel,
  entryPath,
  findChapter,
  findSection,
  readingOrder,
  readingSequence,
  sectionPath,
} from './navigation';

describe('handbook structure', () => {
  const order = readingOrder();

  it('has unique section ids and slugs', () => {
    const ids = order.map((e) => e.section.id);
    const slugs = order.map((e) => e.section.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps sections in ascending numeric order', () => {
    const numbers = order.map((e) => e.section.number);
    const sorted = [...numbers].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    expect(numbers).toEqual(sorted);
  });

  it('keeps every section inside its declared chapter', () => {
    for (const { chapter, section } of order) {
      expect(section.chapter).toBe(chapter.number);
      expect(section.number.startsWith(`${chapter.number}.`)).toBe(true);
      expect(section.id).toBe(section.number);
    }
  });

  it('contains Chapter 05 sections 05.01 through 05.13', () => {
    const expected = Array.from({ length: 13 }, (_, i) => `05.${String(i + 1).padStart(2, '0')}`);
    expect(findChapter('05')?.sections.map((s) => s.number)).toEqual(expected);
  });

  it('has unique chapter numbers and slugs', () => {
    expect(new Set(chapters.map((c) => c.number)).size).toBe(chapters.length);
    expect(new Set(chapters.map((c) => c.slug)).size).toBe(chapters.length);
  });
});

describe('navigation helpers', () => {
  it('builds clean, shareable URLs', () => {
    const chapter = findChapter('05')!;
    const section = findSection(chapter, '05-11-from-clause-deep-dive')!;
    expect(chapterPath(chapter)).toBe('/chapter/05/select-statement');
    expect(sectionPath(chapter, section)).toBe('/chapter/05/select-statement/05-11-from-clause-deep-dive');
  });

  it('reads each chapter introduction before its sections', () => {
    const keys = readingSequence().map(entryKey);
    expect(keys.slice(0, 3)).toEqual(['chapter:05', 'section:05.01', 'section:05.02']);
    // The next chapter's introduction follows the last section of the previous one.
    expect(keys.slice(keys.indexOf('section:05.13'), keys.indexOf('section:05.13') + 3)).toEqual(['section:05.13', 'chapter:06', 'section:06.01']);
    expect(keys.slice(keys.indexOf('section:06.14'), keys.indexOf('section:06.14') + 3)).toEqual(['section:06.14', 'chapter:07', 'section:07.01']);
    expect(keys.at(-1)).toBe('section:07.17');
    // Coming-soon chapters have nothing to read.
    expect(keys).not.toContain('chapter:08');
  });

  it('resolves previous and next entries', () => {
    expect(adjacentEntries('chapter:05').previous).toBeUndefined();
    expect(entryKey(adjacentEntries('chapter:05').next!)).toBe('section:05.01');
    expect(entryKey(adjacentEntries('section:05.01').previous!)).toBe('chapter:05');
    expect(entryKey(adjacentEntries('section:05.11').previous!)).toBe('section:05.10');
    expect(entryKey(adjacentEntries('section:05.11').next!)).toBe('section:05.12');
    expect(entryKey(adjacentEntries('section:05.13').next!)).toBe('chapter:06');
    expect(entryKey(adjacentEntries('chapter:06').previous!)).toBe('section:05.13');
    expect(entryKey(adjacentEntries('section:06.14').next!)).toBe('chapter:07');
    expect(entryKey(adjacentEntries('chapter:07').previous!)).toBe('section:06.14');
    expect(adjacentEntries('section:07.17').next).toBeUndefined();
  });

  it('labels and links sequence entries', () => {
    const [intro, first] = readingSequence();
    expect([entryLabel(intro!), entryPath(intro!)]).toEqual(['Chapter 05: SELECT Statement', '/chapter/05/select-statement']);
    expect([entryLabel(first!), entryPath(first!)]).toEqual([
      '05.01 Introduction to SELECT',
      '/chapter/05/select-statement/05-01-introduction-to-select',
    ]);
  });

  it('returns nothing for unknown ids', () => {
    expect(adjacentEntries('section:99.99')).toEqual({ previous: undefined, next: undefined });
    expect(findChapter('99')).toBeUndefined();
  });
});
