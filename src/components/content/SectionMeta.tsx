import { Caption1, makeStyles, tokens } from '@fluentui/react-components';
import { Clock16Regular } from '@fluentui/react-icons';
import type { Section } from '../../content/types';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXS,
    color: tokens.colorNeutralForeground3,
  },
  item: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
});

export function SectionMeta({ section }: { section: Section }) {
  const styles = useStyles();
  const items = [
    section.readingTime && (
      <span key="time" className={styles.item}>
        <Clock16Regular aria-hidden />
        <Caption1>{section.readingTime} min read</Caption1>
      </span>
    ),
    section.difficulty && <Caption1 key="difficulty">{section.difficulty}</Caption1>,
    section.category && <Caption1 key="category">{section.category}</Caption1>,
  ].filter(Boolean);

  return items.length > 0 ? <div className={styles.root}>{items}</div> : null;
}
