import type { RouteObject } from 'react-router';
import { AppShell } from '../components/layout/AppShell';
import { ChapterPage } from '../pages/ChapterPage';
import { ChaptersPage } from '../pages/ChaptersPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ReaderPage } from '../pages/ReaderPage';

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'chapters', element: <ChaptersPage /> },
      { path: 'chapter/:chapterNumber/:chapterSlug', element: <ChapterPage /> },
      { path: 'chapter/:chapterNumber/:chapterSlug/:sectionSlug', element: <ReaderPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
