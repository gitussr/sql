import { Body1, Caption1, Divider, MessageBar, MessageBarBody, Subtitle1, Title1, tokens } from '@fluentui/react-components';
import { Navigate, useParams } from 'react-router';
import { ContentSkeleton } from '../components/content/ContentSkeleton';
import { SectionBody } from '../components/content/SectionBody';
import { SectionList } from '../components/navigation/SectionList';
import { chapterPath, findChapter } from '../content/navigation';
import { useChapterOverview } from '../content/useContent';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { NotFoundPage } from './NotFoundPage';
import { usePageStyles } from './pageStyles';

export function ChapterPage() {
  const page = usePageStyles();
  const { chapterNumber, chapterSlug } = useParams();
  const chapter = findChapter(chapterNumber);
  const overview = useChapterOverview(chapter?.hasOverview ? chapter.number : undefined);
  useDocumentTitle(chapter ? `Chapter ${chapter.number} — ${chapter.title}` : 'Page not found');

  if (!chapter) return <NotFoundPage />;
  if (chapter.slug !== chapterSlug) return <Navigate to={chapterPath(chapter)} replace />;

  return (
    <div className={page.container}>
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

      {chapter.hasOverview && (
        <>
          <Divider style={{ marginBlock: tokens.spacingVerticalXXL }}>Chapter introduction</Divider>
          {overview.status === 'loading' && <ContentSkeleton />}
          {overview.status === 'error' && (
            <MessageBar intent="warning">
              <MessageBarBody>The chapter introduction couldn't be loaded. Check your connection and try again.</MessageBarBody>
            </MessageBar>
          )}
          {overview.status === 'ready' && <SectionBody content={overview.content} />}
        </>
      )}
    </div>
  );
}
