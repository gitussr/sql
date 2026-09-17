import { Badge, makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  // The amber accent is a fill carrying ink text, never coloured text: amber on
  // a white surface is 1.66:1. Filled this way it is ~10:1 in both themes.
  badge: {
    backgroundColor: 'var(--sg-accent)',
    color: 'var(--sg-accent-ink)',
  },
});

/** Marks a chapter that has no sections written yet. */
export function ComingSoonBadge() {
  const styles = useStyles();
  return (
    <Badge appearance="filled" className={styles.badge}>
      Coming soon
    </Badge>
  );
}
