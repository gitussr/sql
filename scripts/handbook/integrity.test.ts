import { fileURLToPath } from 'node:url';
import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { describe, expect, it } from 'vitest';
import type { SectionContent } from '../../src/content/types.ts';
import { handbookConfig } from './config.ts';
import { buildHandbook, readHandbookFiles } from './load.ts';

/**
 * Guards content integrity against the real handbook: the import must keep
 * every heading, code block, table, list and blockquote from the Markdown.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const files = readHandbookFiles(root);
const handbook = buildHandbook(files, handbookConfig);

type Counts = Record<'heading' | 'code' | 'table' | 'list' | 'blockquote' | 'codeCharacters', number>;

function countSource(markdown: string): Counts {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const tree: Root = fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const counts = tally(tree);
  counts.heading -= 1; // the page title heading is represented by metadata
  return counts;
}

function countContent(content: SectionContent): Counts {
  const counts = tally({ children: content.blocks.flatMap((b) => b.children) });
  counts.heading += content.blocks.filter((b) => b.title).length;
  counts.list += content.blocks.filter((b) => b.topics).length;
  return counts;
}

function tally(node: unknown, counts: Counts = { heading: 0, code: 0, table: 0, list: 0, blockquote: 0, codeCharacters: 0 }): Counts {
  if (!node || typeof node !== 'object') return counts;
  const record = node as { type?: string; value?: string; source?: string; children?: unknown[] };
  switch (record.type) {
    case 'heading':
    case 'table':
    case 'list':
    case 'blockquote':
      counts[record.type] += 1;
      break;
    case 'aside':
      counts.blockquote += 1;
      break;
    case 'code':
      counts.code += 1;
      counts.codeCharacters += record.value!.length;
      break;
    case 'executionOrder':
      counts.code += 1;
      counts.codeCharacters += record.source!.length;
      break;
  }
  record.children?.forEach((child) => tally(child, counts));
  return counts;
}

describe('Chapter 05 import', () => {
  const chapter = handbook.chapters.find((c) => c.number === '05')!;

  it('has no structural errors', () => {
    expect(handbook.diagnostics.filter((d) => d.level === 'error')).toEqual([]);
  });

  it('imports sections 05.01–05.13 with their exact titles', () => {
    expect(chapter.title).toBe('SELECT Statement');
    expect(chapter.sections.map((s) => `${s.number} ${s.title}`)).toEqual([
      '05.01 Introduction to SELECT',
      '05.02 SELECT Syntax',
      '05.03 SELECT *',
      '05.04 Selecting Specific Columns',
      '05.05 Column Aliases',
      '05.06 Expressions & Calculated Columns',
      '05.07 DISTINCT',
      '05.08 NULL Handling in SELECT',
      '05.09 SELECT Without FROM',
      '05.10 SELECT into Variables (DBMS Differences)',
      '05.11 FROM Clause (Deep Dive)',
      '05.12 Execution Flow of SELECT',
      '05.13 Common SELECT Mistakes & Best Practices',
    ]);
  });

  const sources = new Map(files.map((f) => [f.name, f.text]));
  const cases = [
    ...chapter.sections.map((s) => ({ name: `${s.number}`, file: s.source, content: handbook.sections.get(s.id)! })),
    { name: 'chapter introduction', file: 'Chapter Chapter 05 - SELECT Statement.md', content: handbook.overviews.get('05')! },
  ];

  it.each(cases)('preserves every heading, code block, table, list and blockquote in $name', ({ file, content }) => {
    expect(countContent(content)).toEqual(countSource(sources.get(file)!));
  });

  it.each(cases)('recognises the recurring handbook blocks in $name', ({ content }) => {
    const kinds = new Set(content.blocks.map((b) => b.kind));
    for (const kind of ['learning-objectives', 'execution-order', 'callout', 'related-topics', 'summary'] as const) {
      expect(kinds).toContain(kind);
    }
    const executionOrder = content.blocks.find((b) => b.kind === 'execution-order')!;
    expect(executionOrder.children.some((n) => n.type === 'executionOrder')).toBe(true);
  });
});
