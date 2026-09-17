import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ArrowDown12Regular } from '@fluentui/react-icons';
import type { ExecutionStep } from '../../content/types';

/** Canonical logical execution order used when a chapter doesn't author its own listing. */
export const LOGICAL_EXECUTION_ORDER = ['FROM', 'JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'DISTINCT', 'ORDER BY', 'LIMIT'];

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: `0 0 ${tokens.spacingVerticalL}`,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  item: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  step: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: tokens.spacingHorizontalS,
    paddingBlock: tokens.spacingVerticalXXS,
    paddingInline: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  highlighted: {
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    fontWeight: tokens.fontWeightSemibold,
  },
  number: { color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightRegular },
  note: {
    fontFamily: tokens.fontFamilyBase,
    fontWeight: tokens.fontWeightRegular,
    color: tokens.colorBrandForeground1,
  },
  arrow: {
    display: 'flex',
    paddingBlock: '2px',
    paddingInlineStart: tokens.spacingHorizontalL,
    color: tokens.colorNeutralForeground4,
  },
});

type ExecutionOrderReminderProps =
  | { steps: ExecutionStep[]; highlight?: never }
  /** Canonical order with one clause marked, e.g. highlight="WHERE" on a WHERE chapter. */
  | { steps?: never; highlight?: string };

export function ExecutionOrderReminder(props: ExecutionOrderReminderProps) {
  const styles = useStyles();
  const steps =
    props.steps ??
    LOGICAL_EXECUTION_ORDER.map((label) =>
      label.toLowerCase() === props.highlight?.toLowerCase()
        ? { label, note: 'You are here', highlighted: true }
        : { label, highlighted: false },
    );

  return (
    <ol className={styles.list} aria-label="Logical execution order">
      {steps.map((step, index) => (
        <li key={`${index}-${step.label}`} className={styles.item} aria-current={step.highlighted ? 'step' : undefined}>
          <span className={mergeClasses(styles.step, step.highlighted && styles.highlighted)}>
            <span className={styles.number}>{index + 1}.</span>
            <span>{step.label}</span>
            {step.note && <span className={styles.note}>← {step.note}</span>}
          </span>
          {index < steps.length - 1 && (
            <span className={styles.arrow} aria-hidden>
              <ArrowDown12Regular />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
