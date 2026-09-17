import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { chapters } from '../content/chapters';
import { chapterPath, readingOrder, sectionPath } from '../content/navigation';
import { routes } from './routes';

function leafPath(url: string): string | undefined {
  const matches = matchRoutes(routes, url);
  const leaf = matches?.at(-1)?.route;
  return leaf?.index ? '(index)' : leaf?.path;
}

describe('routes', () => {
  it('routes every chapter and section URL to its page', () => {
    for (const chapter of chapters) {
      expect(leafPath(chapterPath(chapter))).toBe('chapter/:chapterNumber/:chapterSlug');
    }
    for (const { chapter, section } of readingOrder()) {
      expect(leafPath(sectionPath(chapter, section))).toBe('chapter/:chapterNumber/:chapterSlug/:sectionSlug');
    }
  });

  it('routes home, chapter list, and unknown URLs', () => {
    expect(leafPath('/')).toBe('(index)');
    expect(leafPath('/chapters')).toBe('chapters');
    expect(leafPath('/does/not/exist')).toBe('*');
  });
});
