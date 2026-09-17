/** Generated at build time by scripts/handbook/vitePlugin.ts from the handbook Markdown. */
declare module 'virtual:handbook' {
  type Chapter = import('./types').Chapter;
  type SectionContent = import('./types').SectionContent;

  export const chapters: Chapter[];
  /** Keyed by section id ("05.11"). */
  export const sectionLoaders: Record<string, () => Promise<{ default: SectionContent }>>;
  /** Keyed by chapter number ("05"). */
  export const overviewLoaders: Record<string, () => Promise<{ default: SectionContent }>>;
}
