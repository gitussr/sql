import { makeStyles, tokens } from '@fluentui/react-components';
import { Link } from 'react-router';
import { chapterPath, findChapter, findSectionById, sectionPath } from '../../content/navigation';
import type { RelatedTopic } from '../../content/types';
import { useProseStyles } from '../content/proseStyles';

const useStyles = makeStyles({
  unlinked: { color: tokens.colorNeutralForeground3 },
});

/** Related Topics: links to sections that exist; others stay as authored text. */
export function RelatedTopics({ topics }: { topics: RelatedTopic[] }) {
  const prose = useProseStyles();
  const styles = useStyles();

  return (
    <ul className={prose.list}>
      {topics.map((topic) => {
        const target = topic.sectionId ? findSectionById(topic.sectionId) : undefined;
        const chapter = topic.chapter ? findChapter(topic.chapter) : undefined;
        const href = target ? sectionPath(target.chapter, target.section) : chapter ? chapterPath(chapter) : undefined;
        return (
          <li key={topic.label} className={prose.listItem}>
            {href ? (
              <Link to={href} className={prose.link}>
                {topic.label}
              </Link>
            ) : (
              <span className={styles.unlinked}>{topic.label}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
