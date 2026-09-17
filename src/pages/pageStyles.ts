import { makeStyles, tokens } from '@fluentui/react-components';

/** Shared vertical rhythm for top-level pages. */
export const usePageStyles = makeStyles({
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalXXL,
  },
  eyebrow: {
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorBrandForeground1,
  },
  title: { margin: 0 },
  lead: { color: tokens.colorNeutralForeground2, margin: 0 },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalXXL,
  },
  sectionTitle: { margin: 0 },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
});
