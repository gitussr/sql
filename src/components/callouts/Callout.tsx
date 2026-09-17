import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import {
  Beaker20Regular,
  BuildingMultiple20Regular,
  Flash20Regular,
  Globe20Regular,
  Lightbulb20Regular,
  Rocket20Regular,
  ShieldLock20Regular,
  type FluentIcon,
} from '@fluentui/react-icons';
import type { ReactNode } from 'react';
import type { CalloutVariant } from '../../content/types';
import { SectionHeading } from '../content/SectionHeading';

const VARIANTS: Record<CalloutVariant, { icon: FluentIcon; accent: 'brand' | 'orange' | 'red' | 'teal' | 'purple' | 'steel' | 'marigold' }> = {
  architecture: { icon: BuildingMultiple20Regular, accent: 'brand' },
  performance: { icon: Flash20Regular, accent: 'orange' },
  security: { icon: ShieldLock20Regular, accent: 'red' },
  production: { icon: Globe20Regular, accent: 'teal' },
  enterprise: { icon: Rocket20Regular, accent: 'purple' },
  'deep-dive': { icon: Beaker20Regular, accent: 'steel' },
  'did-you-know': { icon: Lightbulb20Regular, accent: 'marigold' },
};

const useStyles = makeStyles({
  root: {
    marginBlock: `${tokens.spacingVerticalXXL} ${tokens.spacingVerticalXXL}`,
    paddingBlock: `${tokens.spacingVerticalM} ${tokens.spacingVerticalXS}`,
    paddingInline: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    borderLeftWidth: tokens.strokeWidthThickest,
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--callout-accent)',
    '& > :last-child': { marginBlockEnd: tokens.spacingVerticalM },
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBlock: `0 ${tokens.spacingVerticalS}`,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
  },
  icon: { flexShrink: 0, color: 'var(--callout-accent)' },
  brand: { '--callout-accent': tokens.colorBrandForeground1 },
  orange: { '--callout-accent': tokens.colorPaletteDarkOrangeForeground2 },
  red: { '--callout-accent': tokens.colorPaletteRedForeground2 },
  teal: { '--callout-accent': tokens.colorPaletteTealForeground2 },
  purple: { '--callout-accent': tokens.colorPalettePurpleForeground2 },
  steel: { '--callout-accent': tokens.colorPaletteSteelForeground2 },
  marigold: { '--callout-accent': tokens.colorPaletteMarigoldForeground2 },
});

interface CalloutProps {
  variant: CalloutVariant;
  title: string;
  id?: string;
  children: ReactNode;
}

/**
 * Architecture Insight, Performance Tip, Security Note, Production
 * Consideration, Enterprise Practice, Engine Deep Dive and Did You Know.
 * The title always names the callout, so colour is never the only cue.
 */
export function Callout({ variant, title, id, children }: CalloutProps) {
  const styles = useStyles();
  const { icon: Icon, accent } = VARIANTS[variant];

  return (
    <aside className={mergeClasses(styles.root, styles[accent])} aria-labelledby={id}>
      <SectionHeading level={2} id={id} className={styles.heading}>
        <Icon aria-hidden className={styles.icon} />
        {title}
      </SectionHeading>
      {children}
    </aside>
  );
}
