import { Body1, Button, Caption1, makeStyles, MessageBar, MessageBarActions, MessageBarBody, Title1, tokens } from '@fluentui/react-components';
import { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { ContentSkeleton } from '../components/content/ContentSkeleton';
import { SectionBody } from '../components/content/SectionBody';
import { SectionMeta } from '../components/content/SectionMeta';
import { CollapsibleOutline, ReadingLayout } from '../components/layout/ReadingLayout';
import { PageBreadcrumb } from '../components/navigation/PageBreadcrumb';
import { SequencePager } from '../components/navigation/SequencePager';
import { adjacentEntries, chapterListPath, chapterPath, findChapter, findSection, sectionPath } from '../content/navigation';
import { useSectionContent } from '../content/useContent';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { NotFoundPage } from './NotFoundPage';
import { usePageStyles } from './pageStyles';

const useStyles = makeStyles({
  title: {
    '@media (max-width: 479px)': { fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700 },
  },
});

export function ReaderPage() {
  const page = usePageStyles();
  const styles = useStyles();
  const { hash } = useLocation();
  const { chapterNumber, chapterSlug, sectionSlug } = useParams();
  const chapter = findChapter(chapterNumber);
  const section = chapter && findSection(chapter, sectionSlug);
  const content = useSectionContent(section?.id);
  useDocumentTitle(section ? `${section.number} ${section.title}` : 'Page not found');

  // Deep links (#heading) can only resolve once the lazily loaded content is on the page.
  useEffect(() => {
    if (content.status !== 'ready' || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [content.status, hash]);

  if (!chapter || !section) return <NotFoundPage />;
  if (chapter.slug !== chapterSlug) return <Navigate to={sectionPath(chapter, section)} replace />;

  const { previous, next } = adjacentEntries(`section:${section.id}`);

  return (
    <ReadingLayout outline={content.status === 'ready' ? content.content.outline : undefined}>
      <PageBreadcrumb
        items={[
          { label: 'SQL Guide', href: '/', compact: true },
          { label: `Chapter ${chapter.number}`, href: chapterListPath(chapter) },
          { label: chapter.title, href: chapterPath(chapter) },
          { label: `${section.number} ${section.title}`, compact: true },
        ]}
      />

      <header className={page.header}>
        <Caption1 className={page.eyebrow}>{section.number}</Caption1>
        <Title1 as="h1" className={`${page.title} ${styles.title}`}>
          {section.title}
        </Title1>
        {section.description && (
          <Body1 as="p" className={page.lead}>
            {section.description}
          </Body1>
        )}
        <SectionMeta section={section} />
      </header>

      {content.status === 'loading' && <ContentSkeleton />}
      {content.status === 'error' && (
        <MessageBar intent="warning">
          <MessageBarBody>This section couldn't be loaded. Check your connection and try again.</MessageBarBody>
          <MessageBarActions>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </MessageBarActions>
        </MessageBar>
      )}
      {content.status === 'ready' && (
        <>
          <CollapsibleOutline outline={content.content.outline} />
          <SectionBody content={content.content} />
        </>
      )}

      <SequencePager previous={previous} next={next} contents={{ label: 'Contents', href: chapterPath(chapter) }} />
    </ReadingLayout>
  );
}
