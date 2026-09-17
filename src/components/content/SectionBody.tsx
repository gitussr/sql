import { makeStyles, tokens } from '@fluentui/react-components';
import { Location20Regular } from '@fluentui/react-icons';
import type { ContentBlock, SectionContent } from '../../content/types';
import { Callout } from '../callouts/Callout';
import { RelatedTopics } from '../learning/RelatedTopics';
import { ContentNodes } from './ContentRenderer';
import { useProseStyles } from './proseStyles';
import { SectionHeading } from './SectionHeading';

const useStyles = makeStyles({
  executionOrder: {
    marginBlock: tokens.spacingVerticalXXL,
    paddingBlock: `${tokens.spacingVerticalM} ${tokens.spacingVerticalXS}`,
    paddingInline: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  executionOrderHeading: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBlock: `0 ${tokens.spacingVerticalS}`,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
  },
  executionOrderIcon: { flexShrink: 0, color: tokens.colorBrandForeground1 },
  firstBlock: { '& > h2:first-child': { marginBlockStart: 0 } },
});

/** Renders a section's imported blocks with the matching handbook components. */
export function SectionBody({ content }: { content: SectionContent }) {
  const prose = useProseStyles();
  return (
    <div className={prose.body}>
      {content.blocks.map((block, index) => (
        <Block key={block.id ?? `block-${index}`} block={block} first={index === 0} />
      ))}
    </div>
  );
}

function Block({ block, first }: { block: ContentBlock; first: boolean }) {
  const styles = useStyles();
  const children = <ContentNodes nodes={block.children} />;

  if (!block.title) return <div className={first ? styles.firstBlock : undefined}>{children}</div>;

  switch (block.kind) {
    case 'callout':
      return (
        <Callout variant={block.variant!} title={block.title} id={block.id}>
          {children}
        </Callout>
      );

    case 'execution-order':
      return (
        <section className={styles.executionOrder} aria-labelledby={block.id}>
          <SectionHeading level={2} id={block.id} className={styles.executionOrderHeading}>
            <Location20Regular aria-hidden className={styles.executionOrderIcon} />
            {block.title}
          </SectionHeading>
          {children}
        </section>
      );

    case 'related-topics':
      return (
        <section aria-labelledby={block.id}>
          <SectionHeading level={2} id={block.id}>
            {block.title}
          </SectionHeading>
          {block.topics && <RelatedTopics topics={block.topics} />}
          {children}
        </section>
      );

    // Learning objectives, interview questions, exercises and summaries read as
    // ordinary sections today; each kind is kept so they can gain dedicated UI.
    default:
      return (
        <section aria-labelledby={block.id} data-block={block.kind} className={first ? styles.firstBlock : undefined}>
          <SectionHeading level={2} id={block.id}>
            {block.title}
          </SectionHeading>
          {children}
        </section>
      );
  }
}
