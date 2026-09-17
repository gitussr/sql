import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Button,
  Caption1,
  makeStyles,
  MessageBar,
  MessageBarBody,
  Title1,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeft20Regular, ArrowRight20Regular } from '@fluentui/react-icons';
import { Fragment, type MouseEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { adjacentSections, chapterPath, findChapter, findSection, sectionPath } from '../content/navigation';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { NotFoundPage } from './NotFoundPage';
import { usePageStyles } from './pageStyles';

const useStyles = makeStyles({
  breadcrumb: { marginBottom: tokens.spacingVerticalL, marginInline: `calc(-1 * ${tokens.spacingHorizontalS})` },
  pager: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalXXXL,
    paddingTop: tokens.spacingVerticalL,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
});

export function ReaderPage() {
  const page = usePageStyles();
  const styles = useStyles();
  const navigate = useNavigate();
  const { chapterNumber, chapterSlug, sectionSlug } = useParams();
  const chapter = findChapter(chapterNumber);
  const section = chapter && findSection(chapter, sectionSlug);
  useDocumentTitle(section ? `${section.number} ${section.title}` : 'Page not found');

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
    <article>
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
        <Title1 as="h1" className={page.title}>
          {section.title}
        </Title1>
      </header>

      {/* Markdown rendering is Phase 3/4. */}
      <MessageBar intent="info">
        <MessageBarBody>Section content will appear here once the handbook import is in place.</MessageBarBody>
      </MessageBar>

      <nav className={styles.pager} aria-label="Section navigation">
        {previous ? (
          <Button
            as="a"
            appearance="subtle"
            href={sectionPath(previous.chapter, previous.section)}
            onClick={go(sectionPath(previous.chapter, previous.section))}
            icon={<ArrowLeft20Regular />}
          >
            {previous.section.number} {previous.section.title}
          </Button>
        ) : (
          <span />
        )}
        {next && (
          <Button
            as="a"
            appearance="subtle"
            href={sectionPath(next.chapter, next.section)}
            onClick={go(sectionPath(next.chapter, next.section))}
            icon={<ArrowRight20Regular />}
            iconPosition="after"
          >
            {next.section.number} {next.section.title}
          </Button>
        )}
      </nav>
    </article>
  );
}
