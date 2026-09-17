import { makeStyles, tokens } from '@fluentui/react-components';
import { Info16Regular } from '@fluentui/react-icons';
import type { ReactNode } from 'react';

const useStyles = makeStyles({
  root: {
    marginBlock: `0 ${tokens.spacingVerticalL}`,
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalL,
    borderLeftWidth: tokens.strokeWidthThick,
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorNeutralStroke1,
    borderRadius: `0 ${tokens.borderRadiusMedium} ${tokens.borderRadiusMedium} 0`,
    backgroundColor: tokens.colorNeutralBackground2,
    '& > :last-child': { marginBlockEnd: 0 },
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    marginBlockEnd: tokens.spacingVerticalXXS,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
});

/** Labelled note such as "Portability Tip" or "Remember". */
export function Aside({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <aside className={styles.root} aria-label={label}>
      <div className={styles.label}>
        <Info16Regular aria-hidden />
        {label}
      </div>
      {children}
    </aside>
  );
}
