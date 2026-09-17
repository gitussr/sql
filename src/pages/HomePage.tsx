import { Badge, Body1, Button, Caption1, Divider, makeStyles, Subtitle1, Title1, tokens } from '@fluentui/react-components';
import { ArrowRight20Regular } from '@fluentui/react-icons';
import { Link, useNavigate } from 'react-router';
import { chapters } from '../content/handbook';
import { chapterPath, readingOrder, sectionPath } from '../content/navigation';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { usePageStyles } from './pageStyles';

const useStyles = makeStyles({
  chapterList: { listStyle: 'none', margin: 0, padding: 0 },
  chapterLink: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1,
    textDecoration: 'none',
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  chapterNumber: { minWidth: '2em', fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3 },
  chapterTitle: { flexGrow: 1 },
});

export function HomePage() {
  const page = usePageStyles();
  const styles = useStyles();
  const navigate = useNavigate();
  useDocumentTitle();

  // Progress-aware "Continue Learning" arrives in Phase 7; until then start at the first section.
  const first = readingOrder()[0];

  return (
    <>
      <header className={page.header}>
        <Title1 as="h1" className={page.title}>
          SQL Guide
        </Title1>
        <Body1 as="p" className={page.lead}>
          Master SQL from syntax to database engineering.
        </Body1>
        {first && (
          <div className={page.actions}>
            <Button
              appearance="primary"
              icon={<ArrowRight20Regular />}
              iconPosition="after"
              onClick={() => navigate(sectionPath(first.chapter, first.section))}
            >
              Start learning
            </Button>
          </div>
        )}
      </header>

      <Divider />

      <section className={page.section} aria-labelledby="chapters-heading" style={{ marginTop: tokens.spacingVerticalXXL }}>
        <Subtitle1 as="h2" id="chapters-heading" className={page.sectionTitle}>
          Chapters
        </Subtitle1>
        <ul className={styles.chapterList}>
          {chapters.map((chapter) => (
            <li key={chapter.number}>
              <Link to={chapterPath(chapter)} className={styles.chapterLink}>
                <Caption1 className={styles.chapterNumber}>{chapter.number}</Caption1>
                <Body1 className={styles.chapterTitle}>{chapter.title}</Body1>
                {chapter.status === 'coming-soon' ? (
                  <Badge appearance="outline" color="informative">
                    Coming soon
                  </Badge>
                ) : (
                  <Caption1>{chapter.sections.length} sections</Caption1>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
