import { makeStyles, tokens } from '@fluentui/react-components';
import type { Table } from 'mdast';
import { toPlainText } from '../../content/text';
import { ContentNodes } from './ContentRenderer';

const useStyles = makeStyles({
  scroller: {
    marginBlock: `0 ${tokens.spacingVerticalL}`,
    overflowX: 'auto',
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  headerCell: {
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground3,
    fontWeight: tokens.fontWeightSemibold,
    textAlign: 'start',
    verticalAlign: 'bottom',
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    whiteSpace: 'nowrap',
  },
  cell: {
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalM,
    verticalAlign: 'top',
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    minWidth: '6em',
  },
});

/** GFM table. Scrolls horizontally inside its own keyboard-focusable container so the page never widens. */
export function DataTable({ node }: { node: Table }) {
  const styles = useStyles();
  const [head, ...body] = node.children;
  const align = (index: number) => node.align?.[index] ?? undefined;
  // Name the scroll container after its columns so several tables on a page are distinguishable.
  const label = head ? `Table: ${head.children.map((cell) => toPlainText(cell).trim()).filter(Boolean).join(', ')}` : 'Table';

  return (
    <div className={styles.scroller} role="group" aria-label={label} tabIndex={0}>
      <table className={styles.table}>
        {head && (
          <thead>
            <tr>
              {head.children.map((cell, index) => (
                <th key={index} scope="col" className={styles.headerCell} style={{ textAlign: align(index) }}>
                  <ContentNodes nodes={cell.children} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.children.map((cell, index) => (
                <td key={index} className={styles.cell} style={{ textAlign: align(index) }}>
                  <ContentNodes nodes={cell.children} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
