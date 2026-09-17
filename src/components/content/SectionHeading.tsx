import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Link16Regular } from '@fluentui/react-icons';
import type { ReactNode } from 'react';
import { useProseStyles } from './proseStyles';

const useStyles = makeStyles({
  heading: {
    position: 'relative',
    ':hover > a': { opacity: 1 },
  },
  anchor: {
    display: 'inline-flex',
    alignItems: 'center',
    marginInlineStart: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalXXS,
    borderRadius: tokens.borderRadiusSmall,
    color: tokens.colorNeutralForeground3,
    verticalAlign: 'middle',
    opacity: 0,
    ':focus-visible': { opacity: 1, outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
    ':hover': { color: tokens.colorBrandForeground1 },
    // Touch devices have no hover; keep the link reachable but unobtrusive.
    '@media (hover: none)': { opacity: 0.6 },
  },
});

interface SectionHeadingProps {
  level: 2 | 3 | 4 | 5 | 6;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Heading with a shareable "#" link. */
export function SectionHeading({ level, id, className, children }: SectionHeadingProps) {
  const prose = useProseStyles();
  const styles = useStyles();
  const Tag = `h${level}` as const;
  const levelClass = level === 2 ? prose.h2 : level === 3 ? prose.h3 : prose.h4;

  return (
    <Tag id={id} className={mergeClasses(levelClass, styles.heading, className)}>
      {children}
      {id && (
        <a href={`#${id}`} className={styles.anchor} aria-label="Link to this heading">
          <Link16Regular aria-hidden />
        </a>
      )}
    </Tag>
  );
}
