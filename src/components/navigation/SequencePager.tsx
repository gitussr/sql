import { Body1, Button, Caption1, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ArrowLeft16Regular, ArrowRight16Regular, TextBulletListLtr20Regular } from '@fluentui/react-icons';
import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { entryLabel, entryPath, hrefFor, type SequenceEntry } from '../../content/navigation';
import { useKeyboardShortcuts } from '../../lib/utils/shortcuts';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalXXXL,
    paddingTop: tokens.spacingVerticalL,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (min-width: 640px)': { gridTemplateColumns: '1fr auto 1fr', alignItems: 'start' },
  },
  link: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1,
    textDecoration: 'none',
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  previous: { '@media (min-width: 640px)': { gridColumn: 1, gridRow: 1 } },
  next: { '@media (min-width: 640px)': { textAlign: 'end', alignItems: 'flex-end', gridColumn: 3, gridRow: 1 } },
  direction: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, color: tokens.colorNeutralForeground3 },
  key: {
    display: 'none',
    marginInlineStart: tokens.spacingHorizontalXS,
    paddingInline: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusSmall,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    // Only hint at keyboard shortcuts where a pointer (and so usually a keyboard) is present.
    '@media (hover: hover) and (pointer: fine)': { display: 'inline-block' },
  },
  contents: { justifySelf: 'center', '@media (min-width: 640px)': { gridColumn: 2, gridRow: 1 } },
});

interface SequencePagerProps {
  previous?: SequenceEntry;
  next?: SequenceEntry;
  contents: { label: string; href: string };
}

/** Previous / Contents / Next, with "p" and "n" keyboard shortcuts. */
export function SequencePager({ previous, next, contents }: SequencePagerProps) {
  const styles = useStyles();
  const navigate = useNavigate();

  useKeyboardShortcuts({
    p: previous ? () => navigate(entryPath(previous)) : undefined,
    n: next ? () => navigate(entryPath(next)) : undefined,
  });

  const onContents = (event: MouseEvent) => {
    event.preventDefault();
    navigate(contents.href);
  };

  return (
    <nav className={styles.root} aria-label="Reading sequence">
      {previous && <PagerLink entry={previous} direction="previous" />}
      <Button as="a" appearance="subtle" href={hrefFor(contents.href)} onClick={onContents} icon={<TextBulletListLtr20Regular />} className={styles.contents}>
        {contents.label}
      </Button>
      {next && <PagerLink entry={next} direction="next" />}
    </nav>
  );
}

function PagerLink({ entry, direction }: { entry: SequenceEntry; direction: 'previous' | 'next' }) {
  const styles = useStyles();
  const isNext = direction === 'next';
  const shortcut = isNext ? 'n' : 'p';

  return (
    <Link
      to={entryPath(entry)}
      className={mergeClasses(styles.link, isNext ? styles.next : styles.previous)}
      rel={isNext ? 'next' : 'prev'}
      aria-keyshortcuts={shortcut}
    >
      <Caption1 className={styles.direction}>
        {!isNext && <ArrowLeft16Regular aria-hidden />}
        {isNext ? 'Next' : 'Previous'}
        {isNext && <ArrowRight16Regular aria-hidden />}
        <kbd className={styles.key} aria-hidden>
          {shortcut.toUpperCase()}
        </kbd>
      </Caption1>
      <Body1>{entryLabel(entry)}</Body1>
    </Link>
  );
}
