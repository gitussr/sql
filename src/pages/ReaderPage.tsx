import {
  Body1,
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Button,
  Caption1,
  makeStyles,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Title1,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeft16Regular, ArrowRight16Regular, TextBulletListLtr20Regular } from '@fluentui/react-icons';
import { Fragment, useEffect, type MouseEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ContentSkeleton } from '../components/content/ContentSkeleton';
import { SectionBody } from '../components/content/SectionBody';
import { SectionMeta } from '../components/content/SectionMeta';
import { OnThisPage } from '../components/navigation/OnThisPage';
import { adjacentSections, chapterPath, findChapter, findSection, sectionPath, type SectionEntry } from '../content/navigation';
import { useSectionContent } from '../content/useContent';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { NotFoundPage } from './NotFoundPage';
import { usePageStyles } from './pageStyles';

const WIDE = '@media (min-width: 1400px)';

const useStyles = makeStyles({
  layout: {
    maxWidth: '760px',
    marginInline: 'auto',
    [WIDE]: {
      maxWidth: '1040px',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 760px) 232px',
      columnGap: '48px',
      alignItems: 'start',
    },
  },
  article: { minWidth: 0 },
  sidebar: { display: 'none', [WIDE]: { display: 'block', height: '100%' } },
  collapsible: { [WIDE]: { display: 'none' } },
  breadcrumb: {
    marginBottom: tokens.spacingVerticalL,
    marginInline: `calc(-1 * ${tokens.spacingHorizontalS})`,
    // Fluent breadcrumbs never wrap; long section titles would overflow at 320px.
    '& ol': { flexWrap: 'wrap' },
  },
  title: {
    '@media (max-width: 479px)': { fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700 },
  },
  pager: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalXXXL,
    paddingTop: tokens.spacingVerticalL,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (min-width: 640px)': { gridTemplateColumns: '1fr auto 1fr', alignItems: 'start' },
  },
  pagerLink: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1,
    textDecoration: 'none',
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  next: { '@media (min-width: 640px)': { textAlign: 'end', alignItems: 'flex-end', gridColumn: 3 } },
  direction: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, color: tokens.colorNeutralForeground3 },
  contents: { justifySelf: 'center', '@media (min-width: 640px)': { gridColumn: 2, gridRow: 1 } },
});

export function ReaderPage() {
  const page = usePageStyles();
  const styles = useStyles();
  const navigate = useNavigate();
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

  const { previous, next } = adjacentSections(section.id);
  const crumbs = [
    { label: 'SQL Guide', href: '/' },
    { label: `Chapter ${chapter.number}`, href: chapterPath(chapter) },
    { label: `${section.number} ${section.title}`, href: undefined },
  ];
  const go = (path: string) => (event: MouseEvent) => {
    event.preventDefault();
    navigate(path);
  };

  return (
    <div className={styles.layout}>
      <article className={styles.article}>
        <Breadcrumb aria-label="Breadcrumb" size="small" className={styles.breadcrumb}>
          {crumbs.map((crumb, index) => (
            <Fragment key={crumb.label}>
              {index > 0 && <BreadcrumbDivider />}
              <BreadcrumbItem>
                {crumb.href ? (
                  <BreadcrumbButton href={crumb.href} onClick={go(crumb.href)}>
                    {crumb.label}
                  </BreadcrumbButton>
                ) : (
                  <BreadcrumbButton current>{crumb.label}</BreadcrumbButton>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </Breadcrumb>

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
            <div className={styles.collapsible}>
              <OnThisPage outline={content.content.outline} variant="collapsible" />
            </div>
            <SectionBody content={content.content} />
          </>
        )}

        <nav className={styles.pager} aria-label="Section navigation">
          {previous && <PagerLink entry={previous} direction="previous" />}
          <Button
            as="a"
            appearance="subtle"
            href={chapterPath(chapter)}
            onClick={go(chapterPath(chapter))}
            icon={<TextBulletListLtr20Regular />}
            className={styles.contents}
          >
            Contents
          </Button>
          {next && <PagerLink entry={next} direction="next" />}
        </nav>
      </article>

      {content.status === 'ready' && (
        <aside className={styles.sidebar}>
          <OnThisPage outline={content.content.outline} variant="sidebar" />
        </aside>
      )}
    </div>
  );
}

function PagerLink({ entry, direction }: { entry: SectionEntry; direction: 'previous' | 'next' }) {
  const styles = useStyles();
  const isNext = direction === 'next';
  return (
    <Link
      to={sectionPath(entry.chapter, entry.section)}
      className={`${styles.pagerLink} ${isNext ? styles.next : ''}`}
      rel={isNext ? 'next' : 'prev'}
    >
      <Caption1 className={styles.direction}>
        {!isNext && <ArrowLeft16Regular aria-hidden />}
        {isNext ? 'Next' : 'Previous'}
        {isNext && <ArrowRight16Regular aria-hidden />}
      </Caption1>
      <Body1>
        {entry.section.number} {entry.section.title}
      </Body1>
    </Link>
  );
}
