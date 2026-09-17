import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { parse as parseYaml } from 'yaml';
import type { Chapter, Section, SectionContent } from '../../src/content/types.ts';
import { handbookConfig, type HandbookConfig } from './config.ts';
import type { Diagnostic, DiagnosticRule } from './diagnostics.ts';
import { buildSectionContent, type TopicResolution } from './structure.ts';
import { compareSectionNumbers, normalizeTitle, slugify, toPlainText } from './text.ts';

export interface SourceFile {
  name: string;
  text: string;
}

export interface Handbook {
  chapters: Chapter[];
  /** Section body by section id. */
  sections: Map<string, SectionContent>;
  /** Chapter introduction body by chapter number. */
  overviews: Map<string, SectionContent>;
  /** Files the handbook was built from (for watching). */
  files: string[];
  diagnostics: Diagnostic[];
}

const SECTION_TITLE = /^(\d{2}(?:\.\d{2})+) - (.+)$/;
const CHAPTER_TITLE = /^Chapter (\d{2}) - (.+)$/;
const FILE_CHAPTER = /^Chapter\s+(?:Chapter\s+|-\s+)?(\d{2})\b/;
const REQUIRED_FIELDS = ['title', 'description', 'chapter', 'section'] as const;

/** Reads handbook Markdown files ("Chapter …md") from a directory. */
export function readHandbookFiles(directory: string): SourceFile[] {
  return readdirSync(directory)
    .filter((name) => name.startsWith('Chapter') && name.endsWith('.md'))
    .sort()
    // Normalise line endings: Windows checkouts (core.autocrlf) would otherwise put \r\n into
    // code blocks, making builds differ by OS and copied code carry CRLF.
    .map((name) => ({ name, text: readFileSync(join(directory, name), 'utf8').replace(/\r\n?/g, '\n') }));
}

export function loadHandbook(directory: string, config: HandbookConfig = handbookConfig): Handbook {
  return buildHandbook(readHandbookFiles(directory), config);
}

interface ParsedFile {
  file: SourceFile;
  frontmatter: Record<string, string>;
  markdown: string;
  lineOffset: number;
  tree: Root;
}

export function buildHandbook(files: SourceFile[], config: HandbookConfig = handbookConfig): Handbook {
  const diagnostics: Diagnostic[] = [];
  const error = (rule: DiagnosticRule, file: string | undefined, message: string, line?: number) =>
    diagnostics.push({ level: 'error', rule, file, line, message });
  const warning = (rule: DiagnosticRule, file: string | undefined, message: string, line?: number) =>
    diagnostics.push({ level: 'warning', rule, file, line, message });

  const enabled = new Set(config.chapters.filter((c) => c.status === 'available').map((c) => c.number));
  const configured = new Map(config.chapters.map((c) => [c.number, c]));
  const usedFiles: string[] = [];

  /* 1. Parse files that belong to published chapters. */
  const parsed: ParsedFile[] = [];
  for (const file of files) {
    const split = splitFrontmatter(file.text);
    let frontmatter: Record<string, string> | undefined;
    if (split) {
      try {
        frontmatter = normalizeFrontmatter(parseYaml(split.yaml, { schema: 'failsafe' }));
      } catch (cause) {
        const fileChapter = file.name.match(FILE_CHAPTER)?.[1];
        if (fileChapter && enabled.has(fileChapter)) error('metadata', file.name, `Invalid frontmatter: ${(cause as Error).message}`);
        continue;
      }
    }

    const chapterNumber = frontmatter?.chapter ? frontmatter.chapter.padStart(2, '0') : file.name.match(FILE_CHAPTER)?.[1];
    if (!chapterNumber || !enabled.has(chapterNumber)) continue;
    usedFiles.push(file.name);

    if (!split || !frontmatter) {
      error('metadata', file.name, 'Missing frontmatter.');
      continue;
    }
    const missing = REQUIRED_FIELDS.filter((field) => !frontmatter[field]);
    if (missing.length > 0) {
      error('metadata', file.name, `Missing required frontmatter: ${missing.join(', ')}.`);
      continue;
    }
    const tree = fromMarkdown(split.body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
    parsed.push({ file, frontmatter, markdown: split.body, lineOffset: split.lineOffset, tree });
  }

  /* 2. Build metadata. */
  const chapters = new Map<string, Chapter>();
  const sectionFiles = new Map<string, ParsedFile>();
  const overviewFiles = new Map<string, ParsedFile>();

  for (const number of enabled) {
    chapters.set(number, { number, title: '', slug: '', status: 'available', hasOverview: false, sections: [] });
  }

  for (const entry of parsed) {
    const { frontmatter: fm, file } = entry;
    const chapterNumber = fm.chapter!.padStart(2, '0');
    const chapter = chapters.get(chapterNumber)!;

    const chapterTitle = fm.title!.match(CHAPTER_TITLE);
    if (chapterTitle || fm.section === 'Introduction') {
      if (!chapterTitle || chapterTitle[1] !== chapterNumber) {
        error('metadata', file.name, `Chapter introduction title must be "Chapter ${chapterNumber} - <Title>", found "${fm.title}".`);
        continue;
      }
      if (overviewFiles.has(chapterNumber)) {
        error('duplicate-id', file.name, `Duplicate introduction for chapter ${chapterNumber} (also ${overviewFiles.get(chapterNumber)!.file.name}).`);
        continue;
      }
      if (!checkTitleHeading(entry, `Chapter ${chapterNumber} ${chapterTitle[2]}`, error)) continue;
      overviewFiles.set(chapterNumber, entry);
      chapter.title = chapterTitle[2]!;
      chapter.slug = slugify(chapterTitle[2]!);
      chapter.description = fm.description;
      chapter.hasOverview = true;
      continue;
    }

    const sectionTitle = fm.title!.match(SECTION_TITLE);
    if (!sectionTitle) {
      error('metadata', file.name, `Section title must be "NN.NN - <Title>", found "${fm.title}".`);
      continue;
    }
    const [, number, title] = sectionTitle as unknown as [string, string, string];
    if (!number.startsWith(`${chapterNumber}.`)) {
      error('metadata', file.name, `Section ${number} does not belong to chapter ${chapterNumber} declared in frontmatter.`);
      continue;
    }
    if (normalizeSectionField(fm.section!) !== number) {
      error('metadata', file.name, `Frontmatter section "${fm.section}" does not match title number ${number}.`);
      continue;
    }
    if (sectionFiles.has(number)) {
      error('duplicate-id', file.name, `Duplicate section id ${number} (also ${sectionFiles.get(number)!.file.name}).`);
      continue;
    }
    if (!checkTitleHeading(entry, `${number} ${title}`, error)) continue;

    sectionFiles.set(number, entry);
    const section: Section = {
      id: number,
      number,
      title,
      slug: `${number.replace(/\./g, '-')}-${slugify(title)}`,
      chapter: chapterNumber,
      type: 'article',
      description: fm.description,
      source: file.name,
    };
    if (fm.category) section.category = fm.category;
    if (fm.difficulty) section.difficulty = fm.difficulty;
    const minutes = fm.readingTime?.match(/^(\d+)\s*min/);
    if (minutes) section.readingTime = Number(minutes[1]);
    else if (fm.readingTime) warning('metadata', file.name, `Unrecognised readingTime "${fm.readingTime}" (expected "NN min").`);
    if (fm.lastUpdated) section.lastUpdated = fm.lastUpdated;
    chapter.sections.push(section);
  }

  /* 3. Structural validation. */
  for (const chapter of chapters.values()) {
    chapter.sections.sort((a, b) => compareSectionNumbers(a.number, b.number));
    if (!chapter.hasOverview) error('sequence', undefined, `Chapter ${chapter.number} has no introduction file ("Chapter ${chapter.number} - <Title>").`);
    if (chapter.sections.length === 0) error('sequence', undefined, `Chapter ${chapter.number} has no sections.`);

    const slugs = new Map<string, string>();
    for (const section of chapter.sections) {
      const other = slugs.get(section.slug);
      if (other) error('duplicate-slug', section.source, `Duplicate slug "${section.slug}" (also section ${other}).`);
      slugs.set(section.slug, section.number);
    }
    for (const gap of findNumberingGaps(chapter.sections.map((s) => s.number))) {
      warning('sequence', undefined, `Chapter ${chapter.number}: section numbering jumps from ${gap.from} to ${gap.to}.`);
    }
  }

  const chapterSlugs = new Map<string, string>();
  for (const chapter of chapters.values()) {
    if (!chapter.slug) continue;
    const other = chapterSlugs.get(chapter.slug);
    if (other) error('duplicate-slug', undefined, `Chapters ${other} and ${chapter.number} share slug "${chapter.slug}".`);
    chapterSlugs.set(chapter.slug, chapter.number);
  }

  /* 4. Section bodies. */
  const allSections = new Map([...chapters.values()].flatMap((c) => c.sections.map((s) => [s.id, s] as const)));
  const resolveSection = (number: string, title: string): TopicResolution => {
    const target = allSections.get(number);
    const chapterNumber = number.slice(0, 2);
    if (!target) {
      return enabled.has(chapterNumber) ? { problem: `section ${number} does not exist.` } : {};
    }
    const wanted = normalizeTitle(title);
    const actual = normalizeTitle(target.title);
    if (wanted === actual || actual.startsWith(wanted) || wanted.startsWith(actual)) return { sectionId: target.id };
    return { problem: `section ${number} is titled "${target.title}"; not linked.` };
  };
  const resolveChapter = (number: string): TopicResolution =>
    configured.has(number) ? { chapter: number } : {};

  const sections = new Map<string, SectionContent>();
  const overviews = new Map<string, SectionContent>();
  const build = (entry: ParsedFile) => {
    const result = buildSectionContent(
      { ...entry.tree, children: entry.tree.children.slice(titleHeadingIndex(entry.tree) + 1) },
      { file: entry.file.name, markdown: entry.markdown, lineOffset: entry.lineOffset, resolveSection, resolveChapter },
    );
    diagnostics.push(...result.diagnostics);
    return result.content;
  };

  for (const [number, entry] of sectionFiles) {
    const content = build(entry);
    sections.set(number, content);
    const related = content.blocks.flatMap((block) => block.topics ?? []).flatMap((topic) => (topic.sectionId ? [topic.sectionId] : []));
    if (related.length > 0) allSections.get(number)!.relatedTopics = [...new Set(related)];
  }
  for (const [number, entry] of overviewFiles) overviews.set(number, build(entry));

  /* 5. Assemble chapter list in configured order. */
  const ordered: Chapter[] = config.chapters.map((entry) =>
    entry.status === 'available'
      ? chapters.get(entry.number)!
      : { number: entry.number, title: entry.title, slug: slugify(entry.title), status: 'coming-soon', hasOverview: false, sections: [] },
  );

  return { chapters: ordered, sections, overviews, files: usedFiles, diagnostics };
}

/* ------------------------------------------------------------------ */

function splitFrontmatter(text: string): { yaml: string; body: string; lineOffset: number } | undefined {
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return undefined;
  return { yaml: match[1]!, body: text.slice(match[0].length), lineOffset: match[0].split('\n').length - 1 };
}

/** Frontmatter is read with the YAML failsafe schema so "5.10" stays "5.10" instead of becoming 5.1. */
function normalizeFrontmatter(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('frontmatter is not a key/value map');
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') result[key] = raw.trim();
  }
  return result;
}

/** "5.03" → "05.03". */
function normalizeSectionField(value: string): string {
  const [chapter, ...rest] = value.split('.');
  return [chapter!.padStart(2, '0'), ...rest].join('.');
}

function titleHeadingIndex(tree: Root): number {
  return tree.children.findIndex((node) => node.type !== 'thematicBreak');
}

function checkTitleHeading(
  entry: ParsedFile,
  expected: string,
  error: (rule: DiagnosticRule, file: string | undefined, message: string, line?: number) => void,
): boolean {
  const node = entry.tree.children[titleHeadingIndex(entry.tree)];
  const line = node?.position ? node.position.start.line + entry.lineOffset : undefined;
  if (node?.type !== 'heading' || node.depth !== 1) {
    error('structure', entry.file.name, `The body must start with the title heading "# ${expected}".`, line);
    return false;
  }
  const actual = toPlainText(node).trim();
  if (normalizeTitle(actual) !== normalizeTitle(expected)) {
    error('metadata', entry.file.name, `Title heading "${actual}" does not match frontmatter title "${expected}".`, line);
    return false;
  }
  return true;
}

function findNumberingGaps(numbers: string[]): { from: string; to: string }[] {
  const gaps: { from: string; to: string }[] = [];
  for (let i = 1; i < numbers.length; i++) {
    const previous = numbers[i - 1]!.split('.');
    const current = numbers[i]!.split('.');
    if (previous.length !== current.length) continue;
    if (previous.slice(0, -1).join('.') !== current.slice(0, -1).join('.')) continue;
    if (Number(current.at(-1)) - Number(previous.at(-1)) > 1) gaps.push({ from: numbers[i - 1]!, to: numbers[i]! });
  }
  return gaps;
}
