/**
 * Handbook content model.
 *
 * Metadata (this file's types) drives navigation, breadcrumbs, search,
 * progress and previous/next. Section bodies are loaded separately so the
 * navigation tree stays small.
 */

/** How a section is rendered. `interactive` sections are reserved for future visualizers. */
export type SectionType = 'article' | 'interactive';

export interface Section {
  /** Stable identifier; identical to `number` (e.g. "05.11"). Never renumber. */
  id: string;
  number: string;
  title: string;
  /** URL segment, e.g. "05-11-from-clause-deep-dive". */
  slug: string;
  /** Parent chapter number, e.g. "05". */
  chapter: string;
  type?: SectionType;
  description?: string;
  difficulty?: string;
  readingTime?: number;
  tags?: string[];
  relatedTopics?: string[];
  /** Handbook Markdown source file this section is imported from. */
  source: string;
}

export type ChapterStatus = 'available' | 'coming-soon';

export interface Chapter {
  /** Two-digit chapter number, e.g. "05". */
  number: string;
  title: string;
  slug: string;
  description?: string;
  status: ChapterStatus;
  sections: Section[];
}
