import { Button, makeStyles, mergeClasses, tokens, Tooltip } from '@fluentui/react-components';
import { Checkmark16Regular, Copy16Regular, TextNumberListLtr16Regular, TextWrap16Regular } from '@fluentui/react-icons';
import { useEffect, useRef, useState } from 'react';
import type { HighlightSegment, TokenKind } from '../../content/types';
import { useReadingPreferences } from '../../features/reading/readingPreferences';
import { useProseStyles } from '../content/proseStyles';
import { copyText } from './copyText';

const LANGUAGE_LABELS: Record<string, string> = {
  sql: 'SQL',
  text: 'Text',
  plaintext: 'Text',
  json: 'JSON',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  js: 'JavaScript',
  javascript: 'JavaScript',
  md: 'Markdown',
  markdown: 'Markdown',
  http: 'HTTP',
  python: 'Python',
  c: 'C',
  bash: 'Bash',
  shell: 'Shell',
};

/** Plain text listings (diagrams, trees) where line numbers add noise. */
const PLAIN_LANGUAGES = new Set(['text', 'plaintext']);

const useStyles = makeStyles({
  root: {
    marginBlock: `0 ${tokens.spacingVerticalL}`,
    marginInline: 0,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: 'var(--sg-code-bg)',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    minHeight: '32px',
    paddingInlineStart: tokens.spacingHorizontalM,
    paddingInlineEnd: tokens.spacingHorizontalXXS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  language: {
    flexGrow: 1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    letterSpacing: '0.02em',
  },
  pre: {
    margin: 0,
    paddingBlock: tokens.spacingVerticalM,
    paddingInline: tokens.spacingHorizontalL,
    overflowX: 'auto',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: 'var(--sg-code-fg)',
    tabSize: 4,
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  noWrap: { whiteSpace: 'pre' },
  wrap: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  code: { fontFamily: 'inherit', counterReset: 'line' },
  line: { display: 'inline' },
  numbered: {
    display: 'block',
    // Empty lines must keep their height once each line is a block.
    minHeight: '1.6em',
    paddingInlineStart: '3.25em',
    textIndent: '-3.25em',
    '::before': {
      counterIncrement: 'line',
      content: 'counter(line)',
      display: 'inline-block',
      width: '2.25em',
      marginInlineEnd: '1em',
      textAlign: 'right',
      textIndent: 0,
      color: tokens.colorNeutralForeground4,
      userSelect: 'none',
    },
  },
  k: { color: 'var(--sg-code-k)' },
  s: { color: 'var(--sg-code-s)' },
  n: { color: 'var(--sg-code-n)' },
  b: { color: 'var(--sg-code-b)' },
  c: { color: 'var(--sg-code-c)', fontStyle: 'italic' },
  f: { color: 'var(--sg-code-f)' },
  t: { color: 'var(--sg-code-t)' },
  o: { color: 'var(--sg-code-o)' },
  p: { color: 'var(--sg-code-p)' },
  v: { color: 'var(--sg-code-v)' },
});

interface CodeBlockProps {
  code: string;
  lang?: string | null;
  highlight?: HighlightSegment[];
}

export function CodeBlock({ code, lang, highlight }: CodeBlockProps) {
  const styles = useStyles();
  const prose = useProseStyles();
  const [{ wrapCode, showLineNumbers }, setPreferences] = useReadingPreferences();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const codeRef = useRef<HTMLElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const language = lang?.toLowerCase();
  const label = language ? (LANGUAGE_LABELS[language] ?? language.toUpperCase()) : undefined;
  const supportsLineNumbers = !language || !PLAIN_LANGUAGES.has(language);
  const numbered = supportsLineNumbers && showLineNumbers;
  const lines = splitLines(highlight ?? [code]);

  const onCopy = async () => {
    const ok = await copyText(code);
    if (!ok && codeRef.current) {
      // Leave the code selected so it can be copied with the keyboard.
      window.getSelection()?.selectAllChildren(codeRef.current);
    }
    setCopyState(ok ? 'copied' : 'failed');
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState('idle'), ok ? 2000 : 4000);
  };

  return (
    <figure className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.language}>{label}</span>
        <Tooltip content={wrapCode ? 'Scroll long lines' : 'Wrap long lines'} relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<TextWrap16Regular />}
            aria-pressed={wrapCode}
            onClick={() => setPreferences({ wrapCode: !wrapCode })}
          />
        </Tooltip>
        {supportsLineNumbers && (
          <Tooltip content={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'} relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<TextNumberListLtr16Regular />}
              aria-pressed={showLineNumbers}
              onClick={() => setPreferences({ showLineNumbers: !showLineNumbers })}
            />
          </Tooltip>
        )}
        <Button appearance="subtle" size="small" icon={copyState === 'copied' ? <Checkmark16Regular /> : <Copy16Regular />} onClick={onCopy}>
          {copyState === 'copied' ? 'Copied ✓' : copyState === 'failed' ? 'Copy manually' : 'Copy'}
        </Button>
        <span aria-live="polite" className={prose.visuallyHidden}>
          {copyState === 'copied' ? 'Code copied to clipboard' : copyState === 'failed' ? 'Could not copy automatically. The code is selected; press Control C, or Command C on a Mac, to copy it.' : ''}
        </span>
      </div>
      <pre
        className={mergeClasses(styles.pre, wrapCode ? styles.wrap : styles.noWrap)}
        // Scrollable regions must be keyboard reachable.
        tabIndex={0}
        aria-label={label ? `${label} code` : 'Code'}
      >
        <code ref={codeRef} className={styles.code}>
          {lines.map((line, index) => (
            <span key={index} className={numbered ? styles.numbered : styles.line}>
              {line.map((segment, i) =>
                typeof segment === 'string' ? (
                  segment
                ) : (
                  <span key={i} className={styles[segment[1] satisfies TokenKind]}>
                    {segment[0]}
                  </span>
                ),
              )}
              {!numbered && index < lines.length - 1 ? '\n' : null}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

/** Splits highlight segments into lines, keeping each token's kind. */
export function splitLines(segments: HighlightSegment[]): HighlightSegment[][] {
  const lines: HighlightSegment[][] = [[]];
  for (const segment of segments) {
    const [text, kind] = typeof segment === 'string' ? [segment, undefined] : segment;
    text.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines.at(-1)!.push(kind ? [part, kind] : part);
    });
  }
  return lines;
}
