import { Body1, Caption1, makeStyles, tokens } from '@fluentui/react-components';
import { Link } from 'react-router';
import { sectionPath } from '../../content/navigation';
import type { Chapter } from '../../content/types';

const useStyles = makeStyles({
  list: { listStyle: 'none', margin: 0, padding: 0 },
  link: {
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
  number: {
    minWidth: '3.5em',
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground3,
  },
});

export function SectionList({ chapter }: { chapter: Chapter }) {
  const styles = useStyles();
  return (
    <ol className={styles.list}>
      {chapter.sections.map((section) => (
        <li key={section.id}>
          <Link to={sectionPath(chapter, section)} className={styles.link}>
            <Caption1 className={styles.number}>{section.number}</Caption1>
            <Body1>{section.title}</Body1>
          </Link>
        </li>
      ))}
    </ol>
  );
}
