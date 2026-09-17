import { makeStyles, tokens } from '@fluentui/react-components';

/** Sticky header height plus breathing room, so anchored headings aren't hidden. */
export const ANCHOR_OFFSET = '72px';

/**
 * Long-form reading typography. Fluent's Body1 (14/20) is tuned for UI;
 * handbook prose uses 16px with a relaxed line height.
 */
export const useProseStyles = makeStyles({
  body: {
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase400,
    lineHeight: 1.7,
    color: tokens.colorNeutralForeground1,
    overflowWrap: 'break-word',
  },
  paragraph: { marginBlock: `0 ${tokens.spacingVerticalL}` },
  h2: {
    fontSize: tokens.fontSizeBase600,
    lineHeight: tokens.lineHeightBase600,
    fontWeight: tokens.fontWeightSemibold,
    marginBlock: `${tokens.spacingVerticalXXXL} ${tokens.spacingVerticalM}`,
    scrollMarginTop: ANCHOR_OFFSET,
  },
  h3: {
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    fontWeight: tokens.fontWeightSemibold,
    marginBlock: `${tokens.spacingVerticalXXL} ${tokens.spacingVerticalS}`,
    scrollMarginTop: ANCHOR_OFFSET,
  },
  h4: {
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
    fontWeight: tokens.fontWeightSemibold,
    marginBlock: `${tokens.spacingVerticalXL} ${tokens.spacingVerticalS}`,
    scrollMarginTop: ANCHOR_OFFSET,
  },
  list: {
    marginBlock: `0 ${tokens.spacingVerticalL}`,
    paddingInlineStart: '1.5em',
  },
  listItem: {
    marginBlock: tokens.spacingVerticalXS,
    '::marker': { color: tokens.colorNeutralForeground3 },
  },
  strong: { fontWeight: tokens.fontWeightSemibold },
  inlineCode: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: '0.875em',
    paddingBlock: '0.1em',
    paddingInline: '0.35em',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'var(--sg-code-bg)',
    color: tokens.colorNeutralForeground1,
    overflowWrap: 'anywhere',
  },
  link: {
    color: tokens.colorBrandForegroundLink,
    textDecorationLine: 'underline',
    textUnderlineOffset: '0.15em',
    ':hover': { color: tokens.colorBrandForegroundLinkHover },
  },
  blockquote: {
    marginBlock: `0 ${tokens.spacingVerticalL}`,
    marginInline: 0,
    paddingInlineStart: tokens.spacingHorizontalL,
    borderLeftWidth: tokens.strokeWidthThick,
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorNeutralStroke1,
    color: tokens.colorNeutralForeground2,
  },
  rule: {
    border: 'none',
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    marginBlock: tokens.spacingVerticalXL,
  },
  image: { maxWidth: '100%', height: 'auto' },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  },
});
