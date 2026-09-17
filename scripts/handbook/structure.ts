import type { Blockquote, Code, Heading, List, Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import type {
  AsideNode,
  BlockKind,
  CalloutVariant,
  ContentBlock,
  ContentNode,
  ExecutionOrderNode,
  OutlineEntry,
  RelatedTopic,
  SectionContent,
} from '../../src/content/types.ts';
import { KNOWN_CODE_LANGUAGES } from './config.ts';
import type { Diagnostic, DiagnosticRule } from './diagnostics.ts';
import { parseExecutionSteps } from './executionOrder.ts';
import { createSlugger, toPlainText } from './text.ts';

const CALLOUTS: Record<string, CalloutVariant> = {
  '🏗': 'architecture',
  '⚡': 'performance',
  '🔒': 'security',
  '🌍': 'production',
  '🚀': 'enterprise',
  '🔬': 'deep-dive',
  '💡': 'did-you-know',
};

const EXECUTION_ORDER_ICON = '📍';

const NAMED_BLOCKS: Record<string, BlockKind> = {
  'learning objectives': 'learning-objectives',
  'interview questions': 'interview-questions',
  'hands-on exercises': 'exercises',
  'related topics': 'related-topics',
  summary: 'summary',
};

export interface TopicResolution {
  sectionId?: string;
  chapter?: string;
  /** Explains why a concrete reference could not be linked. */
  problem?: string;
}

export interface StructureContext {
  file: string;
  /** Full Markdown source the tree was parsed from (used to detect unclosed fences). */
  markdown: string;
  /** Lines preceding the Markdown body (frontmatter), for accurate line numbers. */
  lineOffset: number;
  resolveSection(number: string, title: string): TopicResolution;
  resolveChapter(number: string): TopicResolution;
}

/**
 * Converts a parsed section body (title heading already removed) into
 * handbook blocks. Every heading, paragraph, list, table and code block is
 * kept; only block separators (`---` at block edges) are dropped.
 */
export function buildSectionContent(tree: Root, context: StructureContext): { content: SectionContent; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const warn: Report = (rule, node, message) =>
    diagnostics.push({ level: 'warning', rule, file: context.file, line: lineOf(node, context), message });
  const fail: Report = (rule, node, message) =>
    diagnostics.push({ level: 'error', rule, file: context.file, line: lineOf(node, context), message });

  inspectTree(tree, context, warn, fail);

  const slug = createSlugger();
  const outline: OutlineEntry[] = [];
  const blocks: ContentBlock[] = [];

  for (const group of groupByTopLevelHeading(tree.children)) {
    const children = trimSeparators(group.children);
    if (!group.heading) {
      if (children.length > 0) blocks.push({ kind: 'prose', children: transformChildren(children, slug, outline) });
      continue;
    }

    const rawTitle = toPlainText(group.heading).trim();
    const { icon, title } = splitIcon(rawTitle);
    const id = slug(title);
    outline.push({ id, title, depth: 2 });
    const block: ContentBlock = { kind: 'prose', id, title, children: [] };
    if (icon) block.icon = icon;

    const variant = icon ? CALLOUTS[icon.replace(/\uFE0F/g, '')] : undefined;
    if (variant) {
      block.kind = 'callout';
      block.variant = variant;
    } else if (icon === EXECUTION_ORDER_ICON) {
      block.kind = 'execution-order';
    } else {
      block.kind = NAMED_BLOCKS[title.toLowerCase()] ?? 'prose';
    }

    let body = children;
    if (block.kind === 'related-topics') {
      const listIndex = body.findIndex((node) => node.type === 'list');
      if (listIndex !== -1) {
        block.topics = (body[listIndex] as List).children.map((item) => parseTopic(topicLabel(item), item, context, warn));
        body = body.filter((_, index) => index !== listIndex);
      } else {
        warn('structure', group.heading, 'Related Topics has no list of topics.');
      }
    }

    block.children = transformChildren(body, slug, outline);

    if (block.kind === 'execution-order') {
      let converted = 0;
      block.children = block.children.map((node) => {
        if (node.type !== 'code' || (node.lang && node.lang !== 'text')) return node;
        const steps = parseExecutionSteps(node.value);
        if (!steps) return node;
        converted += 1;
        return { type: 'executionOrder', steps, source: node.value } satisfies ExecutionOrderNode;
      });
      if (converted === 0) warn('structure', group.heading, 'Execution Order Reminder contains no recognisable execution order listing.');
    }

    blocks.push(block);
  }

  return { content: stripPositions({ blocks, outline }), diagnostics };
}

/* ------------------------------------------------------------------ */

function groupByTopLevelHeading(nodes: RootContent[]): { heading?: Heading; children: RootContent[] }[] {
  const groups: { heading?: Heading; children: RootContent[] }[] = [{ children: [] }];
  for (const node of nodes) {
    if (node.type === 'heading' && node.depth === 1) groups.push({ heading: node, children: [] });
    else groups.at(-1)!.children.push(node);
  }
  return groups;
}

function trimSeparators(nodes: RootContent[]): RootContent[] {
  let start = 0;
  let end = nodes.length;
  while (start < end && nodes[start]!.type === 'thematicBreak') start += 1;
  while (end > start && nodes[end - 1]!.type === 'thematicBreak') end -= 1;
  return nodes.slice(start, end);
}

function splitIcon(text: string): { icon?: string; title: string } {
  const match = text.match(/^(\p{Extended_Pictographic}\uFE0F?)\s+(.+)$/u);
  return match ? { icon: match[1]!, title: match[2]!.trim() } : { title: text };
}

function transformChildren(nodes: RootContent[], slug: (text: string) => string, outline: OutlineEntry[]): ContentNode[] {
  return nodes.map((node) => transformNode(node, slug, outline));
}

function transformNode(node: RootContent, slug: (text: string) => string, outline: OutlineEntry[]): ContentNode {
  if (node.type === 'heading') {
    const title = toPlainText(node).trim();
    const id = slug(title);
    const depth = Math.min(node.depth + 1, 6) as Heading['depth'];
    if (depth === 3) outline.push({ id, title, depth });
    return { ...node, depth, data: { ...node.data, id } } as Heading;
  }

  if (node.type === 'blockquote') {
    const aside = toAside(node, slug, outline);
    if (aside) return aside;
  }

  if (node.type === 'html') {
    // Raw HTML is never rendered; show it literally (e.g. "<select_list>").
    return { type: 'text', value: node.value } as unknown as ContentNode;
  }

  if ('children' in node && Array.isArray(node.children)) {
    return {
      ...node,
      children: (node.children as RootContent[]).map((child) => transformNode(child, slug, outline)),
    } as ContentNode;
  }
  return node;
}

/** `> **Label:** text` becomes an aside labelled "Label". */
function toAside(node: Blockquote, slug: (text: string) => string, outline: OutlineEntry[]): AsideNode | undefined {
  const [first, ...rest] = node.children;
  if (first?.type !== 'paragraph') return undefined;
  const [lead, ...inline] = first.children;
  if (lead?.type !== 'strong') return undefined;
  const label = toPlainText(lead).trim();
  if (!label.endsWith(':')) return undefined;

  const remaining = trimLeadingWhitespace(inline);
  const children: RootContent[] = remaining.length > 0 ? [{ ...first, children: remaining } as Paragraph, ...rest] : rest;
  return { type: 'aside', label: label.slice(0, -1).trim(), children: transformChildren(children, slug, outline) };
}

function trimLeadingWhitespace(nodes: PhrasingContent[]): PhrasingContent[] {
  const [first, ...rest] = nodes;
  if (first?.type !== 'text') return nodes;
  const value = first.value.replace(/^\s+/, '');
  return value ? [{ ...first, value }, ...rest] : rest;
}

/**
 * Topic text without bold markers. `**05.03 — SELECT ***` is ambiguous emphasis in
 * Markdown and parses as literal asterisks, so the outer `**` pair is removed here.
 */
function topicLabel(item: RootContent): string {
  const text = toPlainText(item).trim();
  const bold = text.match(/^\*\*(.+)\*\*$/);
  return bold ? bold[1]!.trim() : text;
}

function parseTopic(
  label: string,
  node: RootContent,
  context: StructureContext,
  warn: Report,
): RelatedTopic {
  const chapterMatch = label.match(/^Chapter\s+(\d{2})\s*[—–-]\s*(.+)$/);
  if (chapterMatch) {
    const resolved = context.resolveChapter(chapterMatch[1]!);
    if (resolved.problem) warn('reference', node, `Related topic "${label}": ${resolved.problem}`);
    return resolved.chapter ? { label, chapter: resolved.chapter } : { label };
  }

  const sectionMatch = label.match(/^(\d{2}(?:\.(?:\d{2}|xx))+)\s*(?:[—–-]\s*)?(.+)$/);
  if (!sectionMatch) return { label };
  const number = sectionMatch[1]!;
  if (number.includes('xx')) return { label, number };

  const resolved = context.resolveSection(number, sectionMatch[2]!.trim());
  if (resolved.problem) warn('reference', node, `Related topic "${label}": ${resolved.problem}`);
  return resolved.sectionId ? { label, number, sectionId: resolved.sectionId } : { label, number };
}

/* ------------------------------------------------------------------ */

type Report = (rule: DiagnosticRule, node: { position?: { start: { line: number } } } | undefined, message: string) => void;

function inspectTree(tree: Root, context: StructureContext, warn: Report, fail: Report): void {
  const unlabeled: number[] = [];
  visit(tree, (node) => {
    if (node.type === 'code') {
      const code = node as Code;
      if (isUnclosedFence(code, context.markdown)) fail('code-block', code, 'Code block is never closed; it swallows the rest of the file.');
      if (!code.lang) unlabeled.push(lineOf(code, context) ?? 0);
      else if (!KNOWN_CODE_LANGUAGES.has(code.lang.toLowerCase())) warn('code-block', code, `Unknown code block language "${code.lang}".`);
    }
    if (node.type === 'paragraph' && /`{3,}\s*$/.test(toPlainText(node))) {
      warn('code-block', node, 'Paragraph ends with a stray code fence (```).');
    }
  });
  if (unlabeled.length > 0) {
    warn('code-block', undefined, `${unlabeled.length} code block(s) without a language (lines ${unlabeled.join(', ')}).`);
  }
}

function isUnclosedFence(node: Code, markdown: string): boolean {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return false;
  const raw = markdown.slice(start, end);
  const fence = raw.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!fence) return false; // indented code block
  const marker = fence[1]!;
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return true;
  const closing = lines.at(-1)!.trim();
  return !(closing.startsWith(marker[0]!.repeat(marker.length)) && /^(`+|~+)$/.test(closing));
}

function visit(node: unknown, callback: (node: RootContent) => void): void {
  if (!node || typeof node !== 'object') return;
  const record = node as { type?: string; children?: unknown[] };
  if (record.type && record.type !== 'root') callback(node as RootContent);
  if (Array.isArray(record.children)) record.children.forEach((child) => visit(child, callback));
}

function lineOf(node: { position?: { start: { line: number } } } | undefined, context: StructureContext): number | undefined {
  const line = node?.position?.start.line;
  return line === undefined ? undefined : line + context.lineOffset;
}

function stripPositions<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, val) => (key === 'position' ? undefined : val))) as T;
}
