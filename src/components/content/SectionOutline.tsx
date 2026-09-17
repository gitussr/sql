import { Body1, Caption1, makeStyles, Skeleton, SkeletonItem, Subtitle2, tokens } from '@fluentui/react-components';
import type { ContentState } from '../../content/useContent';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingBlock: tokens.spacingVerticalL,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  list: { margin: 0, paddingInlineStart: tokens.spacingHorizontalXL },
  nested: { margin: 0, paddingInlineStart: tokens.spacingHorizontalL, listStyleType: 'circle' },
  item: { paddingBlock: tokens.spacingVerticalXXS },
  skeleton: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  note: { color: tokens.colorNeutralForeground3 },
});

/**
 * Lists the structure of a loaded section.
 * Temporary stand-in until the full content renderer lands in Phase 4.
 */
export function SectionOutline({ state }: { state: ContentState }) {
  const styles = useStyles();

  if (state.status === 'loading') {
    return (
      <Skeleton aria-label="Loading section" className={styles.skeleton}>
        {[70, 55, 80, 60].map((width) => (
          <SkeletonItem key={width} style={{ width: `${width}%` }} />
        ))}
      </Skeleton>
    );
  }

  if (state.status === 'error') {
    return <Body1>This section couldn't be loaded. Check your connection and try again.</Body1>;
  }

  const groups: { title: string; children: string[] }[] = [];
  for (const entry of state.content.outline) {
    if (entry.depth === 2) groups.push({ title: entry.title, children: [] });
    else groups.at(-1)?.children.push(entry.title);
  }

  return (
    <section className={styles.root} aria-labelledby="section-outline">
      <Subtitle2 as="h2" id="section-outline">
        In this section
      </Subtitle2>
      <ol className={styles.list}>
        {groups.map((group) => (
          <li key={group.title} className={styles.item}>
            <Body1>{group.title}</Body1>
            {group.children.length > 0 && (
              <ul className={styles.nested}>
                {group.children.map((child) => (
                  <li key={child}>
                    <Caption1>{child}</Caption1>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <Caption1 className={styles.note}>The full section text is rendered in the next build phase.</Caption1>
    </section>
  );
}
