import { refractor } from 'refractor';
import http from 'refractor/http';
import type { HighlightSegment, TokenKind } from '../../src/content/types.ts';

refractor.register(http);

/**
 * Prism token classes mapped onto the small set of kinds the reader colours.
 * Anything unmapped renders as plain text.
 */
const KIND_BY_CLASS: Record<string, TokenKind> = {
  keyword: 'k',
  important: 'k',
  atrule: 'k',
  rule: 'k',
  selector: 'k',
  'request-line': 'k',
  string: 's',
  char: 's',
  url: 's',
  regex: 's',
  'attr-value': 's',
  'template-string': 's',
  number: 'n',
  boolean: 'b',
  constant: 'b',
  null: 'b',
  symbol: 'b',
  comment: 'c',
  prolog: 'c',
  doctype: 'c',
  cdata: 'c',
  function: 'f',
  'function-variable': 'f',
  method: 'f',
  'class-name': 't',
  builtin: 't',
  namespace: 't',
  'header-name': 't',
  operator: 'o',
  entity: 'o',
  punctuation: 'p',
  variable: 'v',
  property: 'v',
  'attr-name': 'v',
  parameter: 'v',
  identifier: 'v',
};

interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

/** Prism registers these, but they yield no tokens; highlighting would only duplicate the text. */
const PLAIN_LANGUAGES = new Set(['text', 'plaintext', 'plain', 'txt']);

/** Languages without a real grammar (text, mermaid, unlabeled) are not highlighted. */
export function canHighlight(lang: string | null | undefined): lang is string {
  if (!lang) return false;
  const name = lang.toLowerCase();
  return !PLAIN_LANGUAGES.has(name) && refractor.registered(name);
}

/**
 * Tokenises code into `[text, kind]` segments; plain text is a bare string.
 * Joining every segment's text reproduces `value` exactly.
 */
export function highlightCode(value: string, lang: string): HighlightSegment[] {
  const tree = refractor.highlight(value, lang.toLowerCase()) as unknown as HastNode;
  const segments: HighlightSegment[] = [];

  const push = (text: string, kind: TokenKind | undefined) => {
    if (!text) return;
    const last = segments.at(-1);
    const lastKind = typeof last === 'string' ? undefined : last?.[1];
    if (last !== undefined && lastKind === kind) {
      segments[segments.length - 1] = kind ? [segmentText(last) + text, kind] : segmentText(last) + text;
    } else {
      segments.push(kind ? [text, kind] : text);
    }
  };

  const walk = (node: HastNode, kind: TokenKind | undefined) => {
    if (node.type === 'text') {
      // SQL word operators (AND, OR, LIKE, IN …) read as keywords.
      const effective = kind === 'o' && /^[A-Za-z]+$/.test(node.value ?? '') ? 'k' : kind;
      push(node.value ?? '', effective);
      return;
    }
    const classes = Array.isArray(node.properties?.className) ? (node.properties.className as string[]) : [];
    const own = classes.map((name) => KIND_BY_CLASS[name]).find(Boolean);
    node.children?.forEach((child) => walk(child, own ?? kind));
  };

  walk(tree, undefined);
  return segments;
}

export function segmentText(segment: HighlightSegment): string {
  return typeof segment === 'string' ? segment : segment[0];
}
