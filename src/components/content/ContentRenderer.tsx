import type { ListItem, Nodes } from 'mdast';
import { Fragment } from 'react';
import { Link } from 'react-router';
import type { ContentNode } from '../../content/types';
import { Aside } from '../callouts/Aside';
import { CodeBlock } from '../code/CodeBlock';
import { ExecutionOrderReminder } from '../learning/ExecutionOrderReminder';
import { DataTable } from './DataTable';
import { useProseStyles } from './proseStyles';
import { SectionHeading } from './SectionHeading';

type RenderableNode = ContentNode | Nodes;

/**
 * Renders imported handbook content as React elements.
 * No HTML strings are ever injected: raw HTML was converted to text at build time.
 */
export function ContentNodes({ nodes, tight = false }: { nodes: readonly RenderableNode[]; tight?: boolean }) {
  return (
    <>
      {nodes.map((node, index) => (
        <ContentNodeView key={index} node={node} tight={tight} />
      ))}
    </>
  );
}

function ContentNodeView({ node, tight }: { node: RenderableNode; tight: boolean }) {
  const prose = useProseStyles();

  switch (node.type) {
    case 'text':
      return <>{node.value}</>;

    case 'paragraph':
      // Tight list items hold a single paragraph that should not add spacing.
      return tight ? <ContentNodes nodes={node.children} /> : <p className={prose.paragraph}><ContentNodes nodes={node.children} /></p>;

    case 'heading': {
      const level = Math.max(2, Math.min(node.depth, 6)) as 2 | 3 | 4 | 5 | 6;
      return (
        <SectionHeading level={level} id={node.data?.id}>
          <ContentNodes nodes={node.children} />
        </SectionHeading>
      );
    }

    case 'strong':
      return <strong className={prose.strong}><ContentNodes nodes={node.children} /></strong>;
    case 'emphasis':
      return <em><ContentNodes nodes={node.children} /></em>;
    case 'delete':
      return <del><ContentNodes nodes={node.children} /></del>;
    case 'inlineCode':
      return <code className={prose.inlineCode}>{node.value}</code>;
    case 'break':
      return <br />;

    case 'link': {
      const children = <ContentNodes nodes={node.children} />;
      if (node.url.startsWith('/')) {
        return <Link to={node.url} className={prose.link}>{children}</Link>;
      }
      const external = /^https?:\/\//i.test(node.url);
      return (
        <a
          href={isSafeUrl(node.url) ? node.url : undefined}
          className={prose.link}
          title={node.title ?? undefined}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {children}
        </a>
      );
    }

    case 'image':
      return isSafeUrl(node.url) ? (
        <img src={node.url} alt={node.alt ?? ''} title={node.title ?? undefined} className={prose.image} loading="lazy" decoding="async" />
      ) : null;

    case 'list': {
      const Tag = node.ordered ? 'ol' : 'ul';
      return (
        <Tag className={prose.list} start={node.ordered && node.start !== 1 ? (node.start ?? undefined) : undefined}>
          {node.children.map((item, index) => (
            <ListItemView key={index} item={item} tight={!node.spread && !item.spread} />
          ))}
        </Tag>
      );
    }

    case 'blockquote':
      return <blockquote className={prose.blockquote}><ContentNodes nodes={node.children} /></blockquote>;
    case 'thematicBreak':
      return <hr className={prose.rule} />;
    case 'code':
      return <CodeBlock code={node.value} lang={node.lang} highlight={node.data?.highlight} />;
    case 'table':
      return <DataTable node={node} />;
    case 'aside':
      return <Aside label={node.label}><ContentNodes nodes={node.children} /></Aside>;
    case 'executionOrder':
      return <ExecutionOrderReminder steps={node.steps} />;

    case 'footnoteReference':
      return <sup>[{node.label ?? node.identifier}]</sup>;
    case 'imageReference':
      return <>{node.alt}</>;
    case 'definition':
    case 'footnoteDefinition':
    case 'yaml':
      return null;

    default:
      // Unknown containers (e.g. linkReference) still show their text.
      return 'children' in node && Array.isArray(node.children) ? (
        <Fragment>
          <ContentNodes nodes={node.children as RenderableNode[]} />
        </Fragment>
      ) : null;
  }
}

function ListItemView({ item, tight }: { item: ListItem; tight: boolean }) {
  const prose = useProseStyles();
  return (
    <li className={prose.listItem}>
      {typeof item.checked === 'boolean' && (
        <span role="img" aria-label={item.checked ? 'Done' : 'Not done'}>
          {item.checked ? '☑ ' : '☐ '}
        </span>
      )}
      <ContentNodes nodes={item.children} tight={tight} />
    </li>
  );
}

/** Blocks javascript: and other script-capable URLs from Markdown links and images. */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|#|\/|\.{1,2}\/)/i.test(trimmed)) return true;
  // Relative paths without a scheme are safe.
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}
