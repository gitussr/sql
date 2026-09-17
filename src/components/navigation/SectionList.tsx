import { Body1, Caption1, makeStyles, tokens } from '@fluentui/react-components';
import { Link } from 'react-router';
import { sectionPath } from '../../content/navigation';
import type { Chapter, Section } from '../../content/types';
import { splitMatches } from '../../features/chapters/filterChapters';

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
    flexShrink: 0,
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground3,
  },
  mark: {
    backgroundColor: tokens.colorBrandBackground2,
    color: 'inherit',
    borderRadius: tokens.borderRadiusSmall,
  },
});

interface SectionListProps {
  chapter: Chapter;
  /** Defaults to every section in the chapter. */
  sections?: Section[];
  /** Text to highlight in numbers and titles. */
  highlight?: string;
}

export function SectionList({ chapter, sections = chapter.sections, highlight = '' }: SectionListProps) {
  const styles = useStyles();
  const marked = (text: string) =>
    splitMatches(text, highlight).map((part, index) =>
      part.match ? (
        <mark key={index} className={styles.mark}>
          {part.text}
        </mark>
      ) : (
        part.text
      ),
    );

  return (
    <ol className={styles.list}>
      {sections.map((section) => (
        <li key={section.id}>
          <Link to={sectionPath(chapter, section)} className={styles.link}>
            <Caption1 className={styles.number}>{marked(section.number)}</Caption1>
            <Body1>{marked(section.title)}</Body1>
          </Link>
        </li>
      ))}
    </ol>
  );
}
