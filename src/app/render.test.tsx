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

describe('page rendering', () => {
  it('renders home', () => {
    const html = render('/');
    expect(html).toContain('Master SQL from syntax to database engineering.');
    expect(html).toContain('SELECT Statement');
  });

  it('renders the chapter list', () => {
    expect(render('/chapters')).toContain('05.13');
  });

  it('renders a chapter page', () => {
    const html = render('/chapter/05/select-statement');
    expect(html).toContain('Chapter 05');
    expect(html).toContain('05.01');
  });

  it('renders a section with breadcrumb and previous/next', () => {
    const html = render('/chapter/05/select-statement/05-11-from-clause-deep-dive');
    expect(html).toContain('FROM Clause (Deep Dive)');
    expect(html).toContain('/chapter/05/select-statement/05-10-select-into-variables');
    expect(html).toContain('/chapter/05/select-statement/05-12-execution-flow-of-select');
  });

  it('renders not found for unknown chapters, sections and paths', () => {
    expect(render('/chapter/99/nothing')).toContain('Page not found');
    expect(render('/chapter/05/select-statement/05-99-missing')).toContain('Page not found');
    expect(render('/nope')).toContain('Page not found');
  });
});
