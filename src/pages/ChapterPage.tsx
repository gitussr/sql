import { Body1, Caption1, MessageBar, MessageBarBody, Subtitle1, Title1 } from '@fluentui/react-components';
import { Navigate, useParams } from 'react-router';
import { SectionList } from '../components/navigation/SectionList';
import { chapterPath, findChapter } from '../content/navigation';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { NotFoundPage } from './NotFoundPage';
import { usePageStyles } from './pageStyles';

export function ChapterPage() {
  const page = usePageStyles();
  const { chapterNumber, chapterSlug } = useParams();
  const chapter = findChapter(chapterNumber);
  useDocumentTitle(chapter ? `Chapter ${chapter.number} — ${chapter.title}` : 'Page not found');

  if (!chapter) return <NotFoundPage />;
  if (chapter.slug !== chapterSlug) return <Navigate to={chapterPath(chapter)} replace />;

  return (
    <>
      <header className={page.header}>
        <Caption1 className={page.eyebrow}>Chapter {chapter.number}</Caption1>
        <Title1 as="h1" className={page.title}>
          {chapter.title}
        </Title1>
        {chapter.description && (
          <Body1 as="p" className={page.lead}>
            {chapter.description}
          </Body1>
        )}
      </header>

      {chapter.status === 'coming-soon' ? (
        <MessageBar intent="info">
          <MessageBarBody>This chapter is coming soon.</MessageBarBody>
        </MessageBar>
      ) : (
        <section className={page.section} aria-labelledby="sections-heading">
          <Subtitle1 as="h2" id="sections-heading" className={page.sectionTitle}>
            Sections
          </Subtitle1>
          <SectionList chapter={chapter} />
        </section>
      )}
    </>
  );
}
