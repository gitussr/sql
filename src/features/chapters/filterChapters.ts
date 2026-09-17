import type { Chapter, Section } from '../../content/types';

export interface ChapterMatch {
  chapter: Chapter;
  /** Sections to show: all of them when the chapter itself matches. */
  sections: Section[];
  chapterMatches: boolean;
}

/**
 * Filters the handbook outline by number or title.
 * "05.11", "5.11", "distinct" and "chapter 5" all work; matching is case-insensitive.
 */
export function filterChapters(chapters: Chapter[], query: string): ChapterMatch[] {
  const text = normalize(query);
  if (!text) return chapters.map((chapter) => ({ chapter, sections: chapter.sections, chapterMatches: false }));

  const number = padNumber(text);
  const results: ChapterMatch[] = [];
  for (const chapter of chapters) {
    const chapterMatches =
      normalize(`${chapter.number} ${chapter.title}`).includes(text) ||
      normalize(`chapter ${chapter.number}`).includes(number) ||
      normalize(`chapter ${Number(chapter.number)}`).includes(text);
    const sections = chapterMatches
      ? chapter.sections
      : chapter.sections.filter((section) => normalize(`${section.number} ${section.title}`).includes(text) || section.number.startsWith(number));
    if (chapterMatches || sections.length > 0) results.push({ chapter, sections, chapterMatches });
  }
  return results;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "5.11" → "05.11", "5" → "05"; other text is returned unchanged. */
function padNumber(text: string): string {
  return text.replace(/^(\d)(?=\.|$)/, '0$1');
}

/** Splits text into plain and matching parts for highlighting. */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  const needle = normalize(query);
  if (!needle) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  const haystack = text.toLowerCase();
  let index = 0;
  while (index < text.length) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    if (found > index) parts.push({ text: text.slice(index, found), match: false });
    parts.push({ text: text.slice(found, found + needle.length), match: true });
    index = found + needle.length;
  }
  if (index < text.length) parts.push({ text: text.slice(index), match: false });
  return parts;
}
