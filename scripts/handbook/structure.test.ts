import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '../../src/content/types.ts';
import { buildHandbook } from './load.ts';
import { overviewFile, sectionFile } from './testing.ts';

const config = { chapters: [{ number: '05', status: 'available' as const }] };

const body = `
---

# Learning Objectives

- Understand SELECT.

---

# Basic Syntax

Press <kbd>Ctrl</kbd> to use <select_list> placeholders.

## Clauses

\`\`\`sql
SELECT 1;
\`\`\`

---

# 📍 Execution Order Reminder

Written like this:

\`\`\`text
SELECT
FROM
\`\`\`

Processed like this:

\`\`\`text
1. FROM
6. SELECT ← Projection here
\`\`\`

> **Remember:** Syntax order is for humans.

---

# 🏗️ Architecture Insight

Row sources form a graph.

---

# ⚡ Performance Tip

Index well.

---

# Interview Questions

## Basic

1. What is SELECT?

---

# Hands-on Exercises

## Exercise 1

Write a query.

---

# Related Topics

- **05.02 — SELECT Syntax**
- **05.03 — Wrong Title**
- **06.xx — WHERE Clause**
- **Chapter 06 — WHERE Clause**

---

# Summary

Done.
`;

function build() {
  const handbook = buildHandbook(
    [overviewFile(), sectionFile('05.01', 'Introduction to SELECT', body), sectionFile('05.02', 'SELECT Syntax'), sectionFile('05.03', 'SELECT *')],
    config,
  );
  return { handbook, content: handbook.sections.get('05.01')! };
}

const byTitle = (blocks: ContentBlock[], title: string) => blocks.find((b) => b.title === title)!;

describe('section structure', () => {
  it('splits the body into typed blocks and drops the title heading and separators', () => {
    const { content } = build();
    expect(content.blocks.map((b) => [b.kind, b.title, b.variant])).toEqual([
      ['learning-objectives', 'Learning Objectives', undefined],
      ['prose', 'Basic Syntax', undefined],
      ['execution-order', 'Execution Order Reminder', undefined],
      ['callout', 'Architecture Insight', 'architecture'],
      ['callout', 'Performance Tip', 'performance'],
      ['interview-questions', 'Interview Questions', undefined],
      ['exercises', 'Hands-on Exercises', undefined],
      ['related-topics', 'Related Topics', undefined],
      ['summary', 'Summary', undefined],
    ]);
    for (const block of content.blocks) {
      expect(block.children[0]?.type).not.toBe('thematicBreak');
      expect(block.children.at(-1)?.type).not.toBe('thematicBreak');
    }
    expect(JSON.stringify(content)).not.toContain('"position"');
  });

  it('keeps emoji as the block icon', () => {
    const { content } = build();
    expect(byTitle(content.blocks, 'Architecture Insight').icon).toBe('🏗️');
    expect(byTitle(content.blocks, 'Execution Order Reminder').icon).toBe('📍');
  });

  it('shifts headings below block titles and gives them anchor ids', () => {
    const { content } = build();
    const heading = byTitle(content.blocks, 'Basic Syntax').children.find((n) => n.type === 'heading');
    expect(heading).toMatchObject({ depth: 3, data: { id: 'clauses' } });
    expect(content.outline).toContainEqual({ id: 'clauses', title: 'Clauses', depth: 3 });
    expect(content.outline).toContainEqual({ id: 'basic-syntax', title: 'Basic Syntax', depth: 2 });
    // "Basic" inside Interview Questions must not collide with other ids.
    const ids = content.outline.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never skips heading levels, keeping text and order', () => {
    const handbook = buildHandbook(
      [overviewFile(), sectionFile('05.01', 'A', '# Common Mistakes\n\n### Mistake 1\n\nText.\n\n#### Detail\n\n### Mistake 2\n\nText.')],
      config,
    );
    const content = handbook.sections.get('05.01')!;
    const headings = content.blocks[0]!.children.filter((n) => n.type === 'heading');
    expect(headings.map((h) => [h.depth, h.data?.id])).toEqual([
      [3, 'mistake-1'],
      [4, 'detail'],
      [3, 'mistake-2'],
    ]);
    expect(content.outline.filter((e) => e.depth === 3).map((e) => e.id)).toEqual(['mistake-1', 'mistake-2']);
  });

  it('renders raw HTML-like text literally', () => {
    const { content } = build();
    const paragraph = byTitle(content.blocks, 'Basic Syntax').children[0];
    expect(JSON.stringify(paragraph)).toContain('{"type":"text","value":"<kbd>"}');
    expect(JSON.stringify(paragraph)).toContain('<select_list>');
    expect(JSON.stringify(content)).not.toContain('"type":"html"');
  });

  it('converts only logical execution order listings and keeps the source text', () => {
    const { content } = build();
    const children = byTitle(content.blocks, 'Execution Order Reminder').children;
    expect(children.map((n) => n.type)).toEqual(['paragraph', 'code', 'paragraph', 'executionOrder', 'aside']);
    expect(children[3]).toEqual({
      type: 'executionOrder',
      source: '1. FROM\n6. SELECT ← Projection here',
      steps: [
        { label: 'FROM', highlighted: false },
        { label: 'SELECT', note: 'Projection here', highlighted: true },
      ],
    });
  });

  it('turns labelled blockquotes into asides', () => {
    const { content } = build();
    const aside = byTitle(content.blocks, 'Execution Order Reminder').children.at(-1);
    expect(aside).toMatchObject({ type: 'aside', label: 'Remember' });
    expect(JSON.stringify(aside)).toContain('Syntax order is for humans.');
  });

  it('resolves related topics and warns about mismatched references', () => {
    const { handbook, content } = build();
    expect(byTitle(content.blocks, 'Related Topics').topics).toEqual([
      { label: '05.02 — SELECT Syntax', number: '05.02', sectionId: '05.02' },
      { label: '05.03 — Wrong Title', number: '05.03' },
      { label: '06.xx — WHERE Clause', number: '06.xx' },
      { label: 'Chapter 06 — WHERE Clause' },
    ]);
    expect(handbook.chapters[0]!.sections[0]!.relatedTopics).toEqual(['05.02']);
    expect(handbook.diagnostics.map((d) => d.message)).toEqual([
      'Related topic "05.03 — Wrong Title": section 05.03 is titled "SELECT *"; not linked.',
    ]);
  });
});
