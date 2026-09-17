import { Body1, Button, Caption1, Divider, MessageBar, MessageBarBody, Subtitle1, Title1, tokens } from '@fluentui/react-components';
import { ArrowRight20Regular } from '@fluentui/react-icons';
import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ContentSkeleton } from '../components/content/ContentSkeleton';
import { SectionBody } from '../components/content/SectionBody';
import { CollapsibleOutline, ReadingLayout } from '../components/layout/ReadingLayout';
import { PageBreadcrumb } from '../components/navigation/PageBreadcrumb';
import { SectionList } from '../components/navigation/SectionList';
import { SequencePager } from '../components/navigation/SequencePager';
import { adjacentEntries, chapterListPath, chapterPath, findChapter, sectionPath } from '../content/navigation';
import type { OutlineEntry } from '../content/types';
import { useChapterOverview } from '../content/useContent';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { NotFoundPage } from './NotFoundPage';
import { usePageStyles } from './pageStyles';

const SECTIONS_ID = 'sections';

export function ChapterPage() {
  const page = usePageStyles();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { chapterNumber, chapterSlug } = useParams();
  const chapter = findChapter(chapterNumber);
  const overview = useChapterOverview(chapter?.hasOverview ? chapter.number : undefined);
  useDocumentTitle(chapter ? `Chapter ${chapter.number} — ${chapter.title}` : 'Page not found');

  useEffect(() => {
    if (overview.status !== 'ready' || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [overview.status, hash]);

  if (!chapter) return <NotFoundPage />;
  if (chapter.slug !== chapterSlug) return <Navigate to={chapterPath(chapter)} replace />;

  const { previous, next } = adjacentEntries(`chapter:${chapter.number}`);
  const firstSection = chapter.sections[0];
  const outline: OutlineEntry[] | undefined =
    overview.status === 'ready' && chapter.sections.length > 0
      ? [{ id: SECTIONS_ID, title: 'Sections', depth: 2 }, ...overview.content.outline]
      : undefined;

  return (
    <ReadingLayout outline={outline}>
      <PageBreadcrumb
        items={[
          { label: 'SQL Guide', href: '/', compact: true },
          { label: `Chapter ${chapter.number}`, href: chapterListPath(chapter) },
          { label: chapter.title },
        ]}
      />

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
        {firstSection && (
          <div className={page.actions}>
            <Button
              appearance="primary"
              icon={<ArrowRight20Regular />}
              iconPosition="after"
              onClick={() => navigate(sectionPath(chapter, firstSection))}
            >
              Start with {firstSection.number}
            </Button>
          </div>
        )}
      </header>

      {chapter.status === 'coming-soon' ? (
        <MessageBar intent="info">
          <MessageBarBody>This chapter is coming soon.</MessageBarBody>
        </MessageBar>
      ) : (
        <section className={page.section} aria-labelledby={SECTIONS_ID}>
          <Subtitle1 as="h2" id={SECTIONS_ID} className={page.sectionTitle} style={{ scrollMarginTop: '72px' }}>
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
          {overview.status === 'ready' && (
            <>
              <CollapsibleOutline outline={overview.content.outline} />
              <SectionBody content={overview.content} />
            </>
          )}
        </>
      )}

      {chapter.status === 'available' && (
        <SequencePager previous={previous} next={next} contents={{ label: 'All chapters', href: '/chapters' }} />
      )}
    </ReadingLayout>
  );
}
