import { describe, expect, it } from 'vitest';
import { chapters } from './chapters';
import { adjacentSections, chapterPath, findChapter, findSection, readingOrder, sectionPath } from './navigation';

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

  it('resolves previous and next sections', () => {
    expect(adjacentSections('05.01').previous).toBeUndefined();
    expect(adjacentSections('05.01').next?.section.id).toBe('05.02');
    expect(adjacentSections('05.11').previous?.section.id).toBe('05.10');
    expect(adjacentSections('05.11').next?.section.id).toBe('05.12');
    expect(adjacentSections('05.13').next).toBeUndefined();
  });

  it('returns nothing for unknown ids', () => {
    expect(adjacentSections('99.99')).toEqual({ previous: undefined, next: undefined });
    expect(findChapter('99')).toBeUndefined();
  });
});
