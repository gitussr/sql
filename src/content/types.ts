/**
 * Handbook content model.
 *
 * Metadata (`Chapter`, `Section`) drives navigation, breadcrumbs, search,
 * progress and previous/next. Section bodies (`SectionContent`) are generated
 * from the Markdown at build time and loaded per section on demand.
 *
 * This file is shared by the app and the build-time importer in
 * `scripts/handbook`, so it must contain types only.
 */
import type { RootContent } from 'mdast';

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
  type: SectionType;
  description?: string;
  category?: string;
  difficulty?: string;
  /** Minutes. */
  readingTime?: number;
  lastUpdated?: string;
  tags?: string[];
  /** Ids of existing sections listed under "Related Topics". */
  relatedTopics?: string[];
  /** Handbook Markdown file the section is generated from. */
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
  /** Whether the chapter has an introduction page (the "Chapter NN - Title" file). */
  hasOverview: boolean;
  sections: Section[];
}

/* ------------------------------------------------------------------ */
/* Section body                                                        */
/* ------------------------------------------------------------------ */

export type CalloutVariant =
  | 'architecture'
  | 'performance'
  | 'security'
  | 'production'
  | 'enterprise'
  | 'deep-dive'
  | 'did-you-know';

export type BlockKind =
  | 'prose'
  | 'callout'
  | 'execution-order'
  | 'learning-objectives'
  | 'interview-questions'
  | 'exercises'
  | 'related-topics'
  | 'summary';

/**
 * Syntax token kinds: keyword, string, number, boolean/constant, comment,
 * function, type, operator, punctuation, variable/identifier.
 */
export type TokenKind = 'k' | 's' | 'n' | 'b' | 'c' | 'f' | 't' | 'o' | 'p' | 'v';

/** Plain text, or `[text, kind]` for a highlighted token. */
export type HighlightSegment = string | [text: string, kind: TokenKind];

declare module 'mdast' {
  interface CodeData {
    /** Build-time syntax highlighting; joining the segments reproduces `value`. */
    highlight?: HighlightSegment[];
  }
  interface HeadingData {
    /** Anchor id. */
    id?: string;
  }
}

export interface ExecutionStep {
  /** Clause label exactly as authored, e.g. "LIMIT / FETCH / TOP". */
  label: string;
  /** Author's annotation, e.g. "Duplicate elimination occurs here". */
  note?: string;
  /** True when the author marked this step (← note, or "(… here)"). */
  highlighted: boolean;
}

/** A logical execution order listing, parsed from a `text` code block inside an Execution Order Reminder. */
export interface ExecutionOrderNode {
  type: 'executionOrder';
  steps: ExecutionStep[];
  /** Original code block text, kept verbatim. */
  source: string;
}

/** A labelled blockquote such as `> **Portability Tip:** …`. */
export interface AsideNode {
  type: 'aside';
  label: string;
  children: ContentNode[];
}

/**
 * Markdown (mdast) nodes with positions removed, plus handbook-specific nodes.
 * Headings carry `data.id` for anchors and are shifted one level down, because
 * block titles occupy level 2 beneath the page's level-1 section title.
 */
export type ContentNode = RootContent | ExecutionOrderNode | AsideNode;

export interface RelatedTopic {
  /** Text exactly as authored. */
  label: string;
  /** Referenced section number, possibly a placeholder like "06.xx". */
  number?: string;
  /** Set when the reference resolves to an existing section with a matching title. */
  sectionId?: string;
  /** Set for whole-chapter references ("Chapter 06 — WHERE Clause"). */
  chapter?: string;
}

export interface ContentBlock {
  kind: BlockKind;
  /** Anchor id; absent only for untitled leading prose. */
  id?: string;
  /** Block heading text without its emoji. */
  title?: string;
  /** Emoji that prefixed the heading in the source, e.g. "⚡". */
  icon?: string;
  variant?: CalloutVariant;
  topics?: RelatedTopic[];
  children: ContentNode[];
}

export interface OutlineEntry {
  id: string;
  title: string;
  /** 2 = block title, 3 = subsection. */
  depth: number;
}

export interface SectionContent {
  blocks: ContentBlock[];
  outline: OutlineEntry[];
}
