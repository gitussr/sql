/**
 * Which chapters the app publishes.
 *
 * `available` chapters are imported from the handbook Markdown: title, slug and
 * description come from the chapter's "Chapter NN - Title" file and must not be
 * repeated here. `coming-soon` chapters have no content yet, so their title is
 * declared here.
 */
export type ChapterConfig =
  | { number: string; status: 'available' }
  | { number: string; status: 'coming-soon'; title: string };

export interface HandbookConfig {
  chapters: ChapterConfig[];
}

export const handbookConfig: HandbookConfig = {
  chapters: [
    { number: '05', status: 'available' },
    { number: '06', status: 'available' },
    { number: '07', status: 'available' },
    { number: '08', status: 'available' },
    { number: '09', status: 'available' },
    { number: '10', status: 'available' },
    { number: '11', status: 'available' },
    { number: '12', status: 'coming-soon', title: 'Scalar Functions' },
  ],
};

/** Code block languages the reader knows how to label/highlight. */
export const KNOWN_CODE_LANGUAGES = new Set([
  'sql',
  'text',
  'plaintext',
  'json',
  'ts',
  'typescript',
  'js',
  'javascript',
  'md',
  'markdown',
  'http',
  'python',
  'c',
  'bash',
  'shell',
  'mermaid',
]);
