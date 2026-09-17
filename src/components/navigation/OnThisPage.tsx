import { Caption1Strong, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ChevronDown16Regular } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';
import type { OutlineEntry } from '../../content/types';

const useStyles = makeStyles({
  sidebar: {
    position: 'sticky',
    top: '72px',
    maxHeight: 'calc(100dvh - 96px)',
    overflowY: 'auto',
  },
  title: { display: 'block', marginBlockEnd: tokens.spacingVerticalS, color: tokens.colorNeutralForeground2 },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  link: {
    display: 'block',
    // WCAG 2.2 target size: at least 24px tall.
    minHeight: '24px',
    boxSizing: 'border-box',
    paddingBlock: tokens.spacingVerticalXS,
    paddingInlineStart: tokens.spacingHorizontalM,
    borderLeftWidth: tokens.strokeWidthThick,
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorNeutralStroke2,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: tokens.colorNeutralForeground2,
    textDecoration: 'none',
    ':hover': { color: tokens.colorNeutralForeground1, borderLeftColor: tokens.colorNeutralStroke1 },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  active: {
    color: tokens.colorBrandForeground1,
    borderLeftColor: tokens.colorBrandStroke1,
    fontWeight: tokens.fontWeightSemibold,
    ':hover': { color: tokens.colorBrandForeground1, borderLeftColor: tokens.colorBrandStroke1 },
  },
  details: {
    marginBlockEnd: tokens.spacingVerticalXL,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '&[open] > summary svg': { transform: 'rotate(180deg)' },
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalM,
    cursor: 'pointer',
    listStyle: 'none',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    '::-webkit-details-marker': { display: 'none' },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, borderRadius: tokens.borderRadiusMedium },
  },
  detailsBody: { paddingBlock: `0 ${tokens.spacingVerticalM}`, paddingInline: tokens.spacingHorizontalM },
});

interface OnThisPageProps {
  outline: OutlineEntry[];
  /** `sidebar`: sticky right column on wide screens. `collapsible`: disclosure above the content. */
  variant: 'sidebar' | 'collapsible';
}

/** Section headings of the current page, highlighting the one being read. */
export function OnThisPage({ outline, variant }: OnThisPageProps) {
  const styles = useStyles();
  const entries = outline.filter((entry) => entry.depth === 2);
  const activeId = useActiveHeading(entries.map((entry) => entry.id), variant === 'sidebar');

  if (entries.length < 2) return null;

  const list = (
    <ol className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            className={mergeClasses(styles.link, entry.id === activeId && styles.active)}
            aria-current={entry.id === activeId ? 'location' : undefined}
          >
            {entry.title}
          </a>
        </li>
      ))}
    </ol>
  );

  if (variant === 'collapsible') {
    return (
      <details className={styles.details}>
        <summary className={styles.summary}>
          On this page
          <ChevronDown16Regular aria-hidden />
        </summary>
        <nav aria-label="On this page" className={styles.detailsBody}>
          {list}
        </nav>
      </details>
    );
  }

  return (
    <nav aria-labelledby="on-this-page-title" className={styles.sidebar}>
      <Caption1Strong id="on-this-page-title" className={styles.title}>
        On this page
      </Caption1Strong>
      {list}
    </nav>
  );
}

/** Tracks the last heading that has scrolled past the top of the viewport. */
function useActiveHeading(ids: string[], enabled: boolean): string | undefined {
  const [activeId, setActiveId] = useState<string>();
  const key = ids.join('|');

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const update = () => {
      const threshold = 96;
      let current = elements[0]!.id;
      for (const element of elements) {
        if (element.getBoundingClientRect().top - threshold <= 0) current = element.id;
        else break;
      }
      setActiveId(current);
    };

    const observer = new IntersectionObserver(update, { rootMargin: '-80px 0px -60% 0px' });
    elements.forEach((element) => observer.observe(element));
    update();
    return () => observer.disconnect();
    // `key` captures the ids; the array itself changes identity every render.
  }, [key, enabled]);

  return activeId;
}
