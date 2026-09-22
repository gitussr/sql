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
    case 'code': {
      counts.code += 1;
      counts.codeCharacters += record.value!.length;
      if (record.value!.includes('\r')) throw new Error('Code block contains CR line endings; imports must be OS-independent.');
      // Highlighting must never alter code: the segments must spell out the source exactly.
      const highlight = (record as { data?: { highlight?: (string | [string, string])[] } }).data?.highlight;
      if (highlight) {
        const text = highlight.map((s) => (typeof s === 'string' ? s : s[0])).join('');
        if (text !== record.value) throw new Error(`Highlighted code differs from source:\n${record.value}`);
      }
      break;
    }
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

});

describe('Chapter 06 import', () => {
  it('imports the introduction and sections 06.01–06.14 with their exact titles', () => {
    const chapter = handbook.chapters.find((c) => c.number === '06')!;
    expect(chapter).toMatchObject({ title: 'WHERE Clause', slug: 'where-clause', status: 'available', hasOverview: true });
    expect(chapter.sections.map((s) => `${s.number} ${s.title}`)).toEqual([
      '06.01 Introduction to WHERE',
      '06.02 WHERE Syntax',
      '06.03 Comparison Operators',
      '06.04 Logical Operators (AND, OR, NOT)',
      '06.05 BETWEEN',
      '06.06 IN and NOT IN',
      '06.07 LIKE and Pattern Matching',
      '06.08 NULL Handling in WHERE (Three-Valued Logic)',
      '06.09 Filtering with Expressions and Functions',
      '06.10 EXISTS and Subqueries in WHERE (Introduction)',
      '06.11 Execution Flow of WHERE',
      '06.12 SARGability and Index-Friendly Predicates',
      '06.13 Common WHERE Mistakes & Best Practices',
      '06.14 WHERE Cheat Sheet & Visual Knowledge Map',
    ]);
  });

  it('produces no warnings of its own', () => {
    expect(handbook.diagnostics.filter((d) => d.file?.startsWith('Chapter 06'))).toEqual([]);
  });
});

describe('Chapter 07 import', () => {
  it('imports the introduction and sections 07.01–07.17 with their exact titles', () => {
    const chapter = handbook.chapters.find((c) => c.number === '07')!;
    expect(chapter).toMatchObject({ title: 'JOINs', slug: 'joins', status: 'available', hasOverview: true });
    expect(chapter.sections.map((s) => `${s.number} ${s.title}`)).toEqual([
      '07.01 Introduction to JOINs',
      '07.02 JOIN Syntax',
      '07.03 INNER JOIN',
      '07.04 LEFT JOIN (LEFT OUTER JOIN)',
      '07.05 RIGHT JOIN (RIGHT OUTER JOIN)',
      '07.06 FULL OUTER JOIN',
      '07.07 CROSS JOIN',
      '07.08 SELF JOIN',
      '07.09 NATURAL JOIN and USING',
      '07.10 Joining Multiple Tables',
      '07.11 ON vs WHERE (Join Conditions and Filters)',
      '07.12 NULL Handling in JOINs',
      '07.13 Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)',
      '07.14 Execution Flow of JOINs (Join Algorithms)',
      '07.15 JOIN Performance and Index Strategy',
      '07.16 Common JOIN Mistakes & Best Practices',
      '07.17 JOIN Cheat Sheet & Visual Knowledge Map',
    ]);
  });

  it('produces no warnings of its own', () => {
    expect(handbook.diagnostics.filter((d) => d.file?.startsWith('Chapter 07'))).toEqual([]);
  });
});

describe('every published chapter', () => {
  const sources = new Map(files.map((f) => [f.name, f.text]));
  const overviewFile = (number: string) => files.find((f) => new RegExp(`^Chapter (Chapter )?${number} - `).test(f.name))!.name;
  const cases = handbook.chapters
    .filter((chapter) => chapter.status === 'available')
    .flatMap((chapter) => [
      ...chapter.sections.map((s) => ({ name: `${s.number}`, file: s.source, content: handbook.sections.get(s.id)! })),
      { name: `chapter ${chapter.number} introduction`, file: overviewFile(chapter.number), content: handbook.overviews.get(chapter.number)! },
    ]);

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
