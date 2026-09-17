import { Breadcrumb, BreadcrumbButton, BreadcrumbDivider, BreadcrumbItem, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Fragment, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';

export interface Crumb {
  label: string;
  /** Omitted for the current page. */
  href?: string;
  /** Hide on narrow screens, where the full trail would wrap over several lines. */
  compact?: boolean;
}

const useStyles = makeStyles({
  root: {
    marginBottom: tokens.spacingVerticalL,
    marginInline: `calc(-1 * ${tokens.spacingHorizontalS})`,
    // Fluent breadcrumbs never wrap; long titles would overflow at 320px.
    '& ol': { flexWrap: 'wrap' },
  },
  hideNarrow: { '@media (max-width: 639px)': { display: 'none' } },
});

/** Breadcrumb trail with client-side navigation. */
export function PageBreadcrumb({ items }: { items: Crumb[] }) {
  const styles = useStyles();
  const navigate = useNavigate();
  const go = (path: string) => (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(path);
  };

  return (
    <Breadcrumb aria-label="Breadcrumb" size="small" className={styles.root}>
      {items.map((crumb, index) => {
        // A compact crumb takes the divider before it along when hidden.
        const hidden = crumb.compact ? styles.hideNarrow : undefined;
        const firstVisibleOnNarrow = items.slice(0, index).every((previous) => previous.compact);
        return (
          <Fragment key={`${index}-${crumb.label}`}>
            {index > 0 && <BreadcrumbDivider className={mergeClasses(hidden, firstVisibleOnNarrow && styles.hideNarrow)} />}
            <BreadcrumbItem className={hidden}>
              {crumb.href ? (
                <BreadcrumbButton href={crumb.href} onClick={go(crumb.href)}>
                  {crumb.label}
                </BreadcrumbButton>
              ) : (
                <BreadcrumbButton current>{crumb.label}</BreadcrumbButton>
              )}
            </BreadcrumbItem>
          </Fragment>
        );
      })}
    </Breadcrumb>
  );
}
