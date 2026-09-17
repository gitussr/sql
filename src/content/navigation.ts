import { chapters as defaultChapters } from './handbook';
import type { Chapter, Section } from './types';

export interface SectionEntry {
  chapter: Chapter;
  section: Section;
}

export function chapterPath(chapter: Pick<Chapter, 'number' | 'slug'>): string {
  return `/chapter/${chapter.number}/${chapter.slug}`;
}

/** The chapter's entry in the full chapter list. */
export function chapterListPath(chapter: Pick<Chapter, 'number'>): string {
  return `/chapters#chapter-${chapter.number}`;
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

/** A page in the linear reading sequence: a chapter introduction or a section. */
export type SequenceEntry = { kind: 'chapter'; chapter: Chapter } | { kind: 'section'; chapter: Chapter; section: Section };

/** Stable key for a sequence entry: "chapter:05" or "section:05.11". */
export function entryKey(entry: SequenceEntry): string {
  return entry.kind === 'chapter' ? `chapter:${entry.chapter.number}` : `section:${entry.section.id}`;
}

export function entryPath(entry: SequenceEntry): string {
  return entry.kind === 'chapter' ? chapterPath(entry.chapter) : sectionPath(entry.chapter, entry.section);
}

export function entryLabel(entry: SequenceEntry): string {
  return entry.kind === 'chapter'
    ? `Chapter ${entry.chapter.number}: ${entry.chapter.title}`
    : `${entry.section.number} ${entry.section.title}`;
}

/**
 * The order previous/next (and the n/p shortcuts) follow: each available
 * chapter's introduction, then its sections. Coming-soon chapters are skipped.
 */
export function readingSequence(source: Chapter[] = defaultChapters): SequenceEntry[] {
  return source
    .filter((chapter) => chapter.status === 'available')
    .flatMap((chapter): SequenceEntry[] => [
      ...(chapter.hasOverview ? [{ kind: 'chapter' as const, chapter }] : []),
      ...chapter.sections.map((section) => ({ kind: 'section' as const, chapter, section })),
    ]);
}

export function adjacentEntries(
  key: string,
  source: Chapter[] = defaultChapters,
): { previous: SequenceEntry | undefined; next: SequenceEntry | undefined } {
  const sequence = readingSequence(source);
  const index = sequence.findIndex((entry) => entryKey(entry) === key);
  if (index === -1) return { previous: undefined, next: undefined };
  return { previous: sequence[index - 1], next: sequence[index + 1] };
}

/**
 * A routed path as a real URL. React Router resolves `to` against the router
 * basename itself; plain `href` attributes have to be prefixed by hand so they
 * stay correct when the app is served from a sub-path (GitHub Pages).
 */
export function hrefFor(path: string): string {
  const base = import.meta.env.BASE_URL;
  return base === '/' ? path : `${base.replace(/\/$/, '')}${path}`;
}
