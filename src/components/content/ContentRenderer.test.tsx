import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { chapters, loadChapterOverview, loadSectionContent } from '../../content/handbook';
import type { ContentNode, SectionContent } from '../../content/types';
import { ThemeProvider } from '../../features/theme/ThemeProvider';
import { splitLines } from '../code/CodeBlock';
import { ExecutionOrderReminder } from '../learning/ExecutionOrderReminder';
import { ContentNodes, isSafeUrl } from './ContentRenderer';
import { SectionBody } from './SectionBody';

function render(element: ReactNode): string {
  return renderToString(
    <ThemeProvider>
      <MemoryRouter>{element}</MemoryRouter>
    </ThemeProvider>,
  ).replaceAll('<!-- -->', '');
}

const renderNodes = (nodes: ContentNode[]) => render(<ContentNodes nodes={nodes} />);
const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;

function tally(content: SectionContent) {
  const counts = { code: 0, table: 0, executionOrder: 0, aside: 0 };
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const { type, children } = node as { type?: string; children?: unknown[] };
    if (type && type in counts) counts[type as keyof typeof counts] += 1;
    children?.forEach(walk);
  };
  content.blocks.forEach((block) => block.children.forEach(walk));
  return counts;
}

describe('Chapter 05 renders completely', () => {
  const sections = chapters.find((c) => c.number === '05')!.sections;
  const cases = [
    ...sections.map((s) => ({ name: s.number, load: () => loadSectionContent(s.id) })),
    { name: 'chapter introduction', load: () => loadChapterOverview('05') },
  ];

  it.each(cases)('$name', async ({ load }) => {
    const content = await load();
    const html = render(<SectionBody content={content} />);
    const counts = tally(content);

    expect(count(html, /<pre[\s>]/g)).toBe(counts.code);
    expect(count(html, /<table[\s>]/g)).toBe(counts.table);
    expect(count(html, /aria-label="Logical execution order"/g)).toBe(counts.executionOrder);
    const callouts = content.blocks.filter((b) => b.kind === 'callout').length;
    expect(count(html, /<aside[\s>]/g)).toBe(callouts + counts.aside);

    // Every outline entry is a real anchor target, and ids are unique.
    const ids = [...html.matchAll(/<h[2-6][^>]* id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of content.outline) expect(ids).toContain(entry.id);

    expect(html).not.toMatch(/>undefined<|\[object Object\]/);
  });
});

describe('ContentNodes', () => {
  it('escapes text instead of injecting HTML', () => {
    const html = renderNodes([{ type: 'paragraph', children: [{ type: 'text', value: '<script>alert(1)</script>' }] }]);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('drops unsafe link targets and isolates external links', () => {
    const html = renderNodes([
      {
        type: 'paragraph',
        children: [
          { type: 'link', url: 'javascript:alert(1)', children: [{ type: 'text', value: 'bad' }] },
          { type: 'link', url: 'https://www.postgresql.org/docs/', children: [{ type: 'text', value: 'docs' }] },
        ],
      },
    ]);
    expect(html).not.toContain('javascript:');
    expect(html).toMatch(/href="https:\/\/www\.postgresql\.org\/docs\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  });

  it('renders tight lists without paragraph wrappers and keeps ordered list starts', () => {
    const html = renderNodes([
      {
        type: 'list',
        ordered: true,
        start: 4,
        spread: false,
        children: [{ type: 'listItem', spread: false, children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Explain views.' }] }] }],
      },
    ]);
    expect(html).toMatch(/<ol[^>]*start="4"/);
    expect(html).toMatch(/<li[^>]*>Explain views\.<\/li>/);
  });

  it('renders tables with column headers, alignment and a scrollable region', () => {
    const cell = (value: string) => ({ type: 'tableCell' as const, children: [{ type: 'text' as const, value }] });
    const html = renderNodes([
      {
        type: 'table',
        align: [null, 'center'],
        children: [
          { type: 'tableRow', children: [cell('Feature'), cell('PostgreSQL')] },
          { type: 'tableRow', children: [cell('CTE'), cell('✅')] },
        ],
      },
    ]);
    expect(html).toMatch(/role="group" aria-label="Table: Feature, PostgreSQL" tabindex="0"/);
    expect(count(html, /<th [^>]*scope="col"/g)).toBe(2);
    expect(html).toMatch(/<td[^>]*style="text-align:center"[^>]*>✅<\/td>/);
  });

  it('renders highlighted code with a language label, copy button and token classes', () => {
    const html = renderNodes([
      { type: 'code', lang: 'sql', value: 'SELECT 1;', data: { highlight: [['SELECT', 'k'], ' ', ['1', 'n'], [';', 'p']] } },
    ]);
    expect(html).toContain('>SQL<');
    expect(html).toContain('>Copy<');
    expect(html).toMatch(/aria-label="SQL code"/);
    expect(html).toMatch(/<span class="[^"]+">SELECT<\/span> <span class="[^"]+">1<\/span>/);
  });

  it('renders asides with their label', () => {
    const html = renderNodes([{ type: 'aside', label: 'Portability Tip', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Use CTEs.' }] }] }]);
    expect(html).toMatch(/<aside[^>]*aria-label="Portability Tip"/);
    expect(html).toContain('Use CTEs.');
  });

  it('allows only safe URL schemes', () => {
    expect(['https://a.b', 'http://a.b', 'mailto:x@y.z', '#id', '/chapter/05', './x.png', 'img.png'].every(isSafeUrl)).toBe(true);
    expect(['javascript:alert(1)', ' JavaScript:x', 'data:text/html,x', 'vbscript:x'].some(isSafeUrl)).toBe(false);
  });
});

describe('ExecutionOrderReminder', () => {
  it('marks authored highlights as the current step', () => {
    const html = render(
      <ExecutionOrderReminder
        steps={[
          { label: 'FROM', highlighted: false },
          { label: 'DISTINCT', note: 'Duplicate elimination occurs here', highlighted: true },
        ]}
      />,
    );
    expect(count(html, /aria-current="step"/g)).toBe(1);
    expect(html).toMatch(/aria-current="step"[\s\S]*DISTINCT[\s\S]*← Duplicate elimination occurs here/);
  });

  it('highlights a clause in the canonical order for future chapters', () => {
    const html = render(<ExecutionOrderReminder highlight="where" />);
    expect(count(html, /<li/g)).toBe(9);
    expect(html).toMatch(/aria-current="step"[\s\S]*WHERE[\s\S]*← You are here/);
  });
});

describe('splitLines', () => {
  it('splits tokens across lines and keeps their kinds', () => {
    expect(splitLines([['SELECT', 'k'], '\n  ', ["'a\nb'", 's']])).toEqual([[['SELECT', 'k']], ['  ', ["'a", 's']], [["b'", 's']]]);
    expect(splitLines(['a\n\nb'])).toEqual([['a'], [], ['b']]);
  });
});
