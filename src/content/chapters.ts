import type { Chapter, Section } from './types';

/**
 * Handbook structure. Titles and numbers mirror the Markdown frontmatter
 * exactly; section numbers must never be changed.
 *
 * Phase 3 replaces this hand-maintained list with metadata generated from the
 * Markdown frontmatter at build time.
 */

function section(number: string, title: string, slug: string, source: string): Section {
  return { id: number, number, title, slug, chapter: number.slice(0, 2), type: 'article', source };
}

export const chapters: Chapter[] = [
  {
    number: '05',
    title: 'SELECT Statement',
    slug: 'select-statement',
    description:
      'Master the SQL SELECT statement, the foundation of data retrieval. Learn syntax, execution flow, column selection, expressions, aliases, DISTINCT, NULL handling, production practices, performance considerations, and enterprise-grade query writing.',
    status: 'available',
    sections: [
      section('05.01', 'Introduction to SELECT', '05-01-introduction-to-select', 'Chapter 05.01 - Introduction to SELECT.md'),
      section('05.02', 'SELECT Syntax', '05-02-select-syntax', 'Chapter 05.02 - SELECT Syntax.md'),
      section('05.03', 'SELECT *', '05-03-select-all-columns', 'Chapter 05-03-select-all-columns.md'),
      section('05.04', 'Selecting Specific Columns', '05-04-selecting-specific-columns', 'Chapter 05.04 - Selecting Specific Columns.md'),
      section('05.05', 'Column Aliases', '05-05-column-aliases', 'Chapter 05.05 - Column Aliases.md'),
      section('05.06', 'Expressions & Calculated Columns', '05-06-expressions-and-calculated-columns', 'Chapter 05.06 - Expressions & Calculated Columns.md'),
      section('05.07', 'DISTINCT', '05-07-distinct', 'Chapter 05.07 - DISTINCT.md'),
      section('05.08', 'NULL Handling in SELECT', '05-08-null-handling-in-select', 'Chapter 05.08 - NULL Handling in SELECT.md'),
      section('05.09', 'SELECT Without FROM', '05-09-select-without-from', 'Chapter 05.09 - SELECT Without FROM.md'),
      section('05.10', 'SELECT into Variables (DBMS Differences)', '05-10-select-into-variables', 'Chapter 05.10 - SELECT into Variables DBMS Differences.md'),
      section('05.11', 'FROM Clause (Deep Dive)', '05-11-from-clause-deep-dive', 'Chapter 05.11 - FROM Clause Deep Dive.md'),
      section('05.12', 'Execution Flow of SELECT', '05-12-execution-flow-of-select', 'Chapter 05.12 - Execution Flow of SELECT.md'),
      section('05.13', 'Common SELECT Mistakes & Best Practices', '05-13-common-select-mistakes-and-best-practices', 'Chapter 05.13 - Common SELECT Mistakes and Best Practices.md'),
      // 05.14 (SELECT Cheat Sheet & Visual Knowledge Map) is listed in MASTER_PROMPT.md, but no source file exists yet.
    ],
  },
  {
    number: '06',
    title: 'WHERE Clause',
    slug: 'where-clause',
    status: 'coming-soon',
    sections: [],
  },
];
