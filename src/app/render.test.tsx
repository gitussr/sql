import { renderToString } from 'react-dom/server';
// Import both from the same entry: under Node, react-router/dom can load a second router context instance.
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../features/theme/ThemeProvider';
import { routes } from './routes';

function render(url: string): string {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  // Strip React's text-node separators so assertions can match plain text.
  return renderToString(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  ).replaceAll('<!-- -->', '');
}

/** Visible text of each breadcrumb item, in order. */
function breadcrumb(html: string): string[] {
  const nav = html.match(/<nav[^>]*aria-label="Breadcrumb"[\s\S]*?<\/nav>/)?.[0] ?? '';
  return [...nav.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
}

/** The opening tag of the pager link marked rel="prev" or rel="next". */
function pagerLink(html: string, rel: 'prev' | 'next'): string | undefined {
  return html.match(new RegExp(`<a[^>]*rel="${rel}"[^>]*>`))?.[0];
}

describe('page rendering', () => {
  it('renders home', () => {
    const html = render('/');
    expect(html).toContain('Master SQL from syntax to database engineering.');
    expect(html).toContain('SELECT Statement');
  });

  it('renders the chapter list with a filter and expandable chapters', () => {
    const html = render('/chapters');
    expect(html).toContain('Filter chapters and sections');
    expect(html).toContain('id="chapter-05"');
    expect(html).toContain('05.13');
    expect(html).toMatch(/aria-expanded="true"[^>]*>[\s\S]*?SELECT Statement/);
    expect(html).toContain('Coming soon');
  });

  it('renders a chapter page with breadcrumb, sections and next section', () => {
    const html = render('/chapter/05/select-statement');
    expect(breadcrumb(html)).toEqual(['SQL Guide', 'Chapter 05', 'SELECT Statement']);
    expect(html).toContain('href="/chapters#chapter-05"');
    expect(html).toContain('Start with 05.01');
    expect(pagerLink(html, 'next')).toContain('href="/chapter/05/select-statement/05-01-introduction-to-select"');
    expect(pagerLink(html, 'next')).toContain('aria-keyshortcuts="n"');
    expect(pagerLink(html, 'prev')).toBeUndefined();
  });

  it('renders a section with the full breadcrumb and previous/next', () => {
    const html = render('/chapter/05/select-statement/05-11-from-clause-deep-dive');
    expect(breadcrumb(html)).toEqual(['SQL Guide', 'Chapter 05', 'SELECT Statement', '05.11 FROM Clause (Deep Dive)']);
    expect(pagerLink(html, 'prev')).toContain('href="/chapter/05/select-statement/05-10-select-into-variables-dbms-differences"');
    expect(pagerLink(html, 'next')).toContain('href="/chapter/05/select-statement/05-12-execution-flow-of-select"');
  });

  it('links the first section back to the chapter introduction', () => {
    const html = render('/chapter/05/select-statement/05-01-introduction-to-select');
    expect(pagerLink(html, 'prev')).toContain('href="/chapter/05/select-statement"');
    expect(html).toContain('Chapter 05: SELECT Statement');
  });

  it('renders not found for unknown chapters, sections and paths', () => {
    expect(render('/chapter/99/nothing')).toContain('Page not found');
    expect(render('/chapter/05/select-statement/05-99-missing')).toContain('Page not found');
    expect(render('/nope')).toContain('Page not found');
  });
});
