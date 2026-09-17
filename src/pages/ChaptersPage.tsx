import { Badge, Body1, makeStyles, Subtitle1, Title1, tokens } from '@fluentui/react-components';
import { Link } from 'react-router';
import { SectionList } from '../components/navigation/SectionList';
import { chapters } from '../content/handbook';
import { chapterPath } from '../content/navigation';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { usePageStyles } from './pageStyles';

const useStyles = makeStyles({
  headingLink: {
    color: tokens.colorNeutralForeground1,
    textDecoration: 'none',
    ':hover': { color: tokens.colorBrandForeground1, textDecoration: 'underline' },
  },
});

export function ChaptersPage() {
  const page = usePageStyles();
  const styles = useStyles();
  useDocumentTitle('All chapters');

  return (
    <div className={page.container}>
      <header className={page.header}>
        <Title1 as="h1" className={page.title}>
          All chapters
        </Title1>
        <Body1 as="p" className={page.lead}>
          The complete handbook structure.
        </Body1>
      </header>

      {chapters.map((chapter) => (
        <section key={chapter.number} className={page.section} aria-labelledby={`chapter-${chapter.number}`}>
          <Subtitle1 as="h2" id={`chapter-${chapter.number}`} className={page.sectionTitle}>
            <Link to={chapterPath(chapter)} className={styles.headingLink}>
              {chapter.number} {chapter.title}
            </Link>
          </Subtitle1>
          {chapter.status === 'coming-soon' ? (
            <div>
              <Badge appearance="outline" color="informative">
                Coming soon
              </Badge>
            </div>
          ) : (
            <SectionList chapter={chapter} />
          )}
        </section>
      ))}
    </div>
  );
}
