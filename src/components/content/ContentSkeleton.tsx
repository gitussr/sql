import { makeStyles, Skeleton, SkeletonItem, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  heading: { width: '40%', height: '24px', marginBlockStart: tokens.spacingVerticalL },
});

const LINES = [96, 88, 92, 60];

/** Placeholder while a section's content chunk loads. */
export function ContentSkeleton() {
  const styles = useStyles();
  return (
    <Skeleton aria-label="Loading section" className={styles.root}>
      {[0, 1].map((group) => (
        <div key={group} className={styles.root}>
          <SkeletonItem className={styles.heading} />
          {LINES.map((width) => (
            <SkeletonItem key={width} style={{ width: `${width}%` }} />
          ))}
        </div>
      ))}
    </Skeleton>
  );
}
