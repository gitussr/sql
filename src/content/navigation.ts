import { chapters as defaultChapters } from './handbook';
import type { Chapter, Section } from './types';

export interface SectionEntry {
  chapter: Chapter;
  section: Section;
}

export function chapterPath(chapter: Pick<Chapter, 'number' | 'slug'>): string {
  return `/chapter/${chapter.number}/${chapter.slug}`;
}

export function sectionPath(chapter: Pick<Chapter, 'number' | 'slug'>, section: Pick<Section, 'slug'>): string {
  return `${chapterPath(chapter)}/${section.slug}`;
}

export function findChapter(number: string | undefined, source: Chapter[] = defaultChapters): Chapter | undefined {
  return source.find((c) => c.number === number);
}

export function findSection(chapter: Chapter, slug: string | undefined): Section | undefined {
  return chapter.sections.find((s) => s.slug === slug);
}

export function findSectionById(id: string, source: Chapter[] = defaultChapters): SectionEntry | undefined {
  return readingOrder(source).find((entry) => entry.section.id === id);
}

/** All sections in reading order, across chapters. */
export function readingOrder(source: Chapter[] = defaultChapters): SectionEntry[] {
  return source.flatMap((chapter) => chapter.sections.map((section) => ({ chapter, section })));
}

export function adjacentSections(
  id: string,
  source: Chapter[] = defaultChapters,
): { previous: SectionEntry | undefined; next: SectionEntry | undefined } {
  const order = readingOrder(source);
  const index = order.findIndex((entry) => entry.section.id === id);
  if (index === -1) return { previous: undefined, next: undefined };
  return { previous: order[index - 1], next: order[index + 1] };
}
