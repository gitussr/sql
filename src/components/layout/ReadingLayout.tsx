import { makeStyles } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import type { OutlineEntry } from '../../content/types';
import { OnThisPage } from '../navigation/OnThisPage';

const WIDE = '@media (min-width: 1400px)';

const useStyles = makeStyles({
  layout: {
    maxWidth: '760px',
    marginInline: 'auto',
    [WIDE]: {
      maxWidth: '1040px',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 760px) 232px',
      columnGap: '48px',
      alignItems: 'start',
    },
  },
  main: { minWidth: 0 },
  sidebar: { display: 'none', [WIDE]: { display: 'block', height: '100%' } },
  collapsible: { [WIDE]: { display: 'none' } },
});

/**
 * Long-form page layout: a 760px reading column, plus a sticky "On this page"
 * column on wide screens. Narrower screens get a collapsible outline instead,
 * rendered wherever the page places <CollapsibleOutline />.
 */
export function ReadingLayout({ outline, children }: { outline?: OutlineEntry[]; children: ReactNode }) {
  const styles = useStyles();
  return (
    <div className={styles.layout}>
      <article className={styles.main}>{children}</article>
      {outline && (
        <aside className={styles.sidebar}>
          <OnThisPage outline={outline} variant="sidebar" />
        </aside>
      )}
    </div>
  );
}

export function CollapsibleOutline({ outline }: { outline: OutlineEntry[] }) {
  const styles = useStyles();
  return (
    <div className={styles.collapsible}>
      <OnThisPage outline={outline} variant="collapsible" />
    </div>
  );
}
