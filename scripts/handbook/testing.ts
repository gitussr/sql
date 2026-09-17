import type { SourceFile } from './load.ts';

/** Builds an in-memory handbook Markdown file for tests. */
export function markdownFile(name: string, frontmatter: Record<string, string>, body: string): SourceFile {
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return { name, text: `---\n${yaml}\n---\n\n${body.trim()}\n` };
}

export function overviewFile(chapter = '05', title = 'SELECT Statement', body = ''): SourceFile {
  return markdownFile(
    `Chapter Chapter ${chapter} - ${title}.md`,
    { title: `"Chapter ${chapter} - ${title}"`, description: '"Chapter description."', chapter: String(Number(chapter)), section: 'Introduction' },
    `# Chapter ${chapter} — ${title}\n\n${body}`,
  );
}

export function sectionFile(number: string, title: string, body = 'Text.', extra: Record<string, string> = {}): SourceFile {
  const [chapter, rest] = number.split('.') as [string, string];
  return markdownFile(
    `Chapter ${number} - ${title}.md`,
    {
      title: `"${number} - ${title}"`,
      description: `"About ${title}."`,
      chapter: String(Number(chapter)),
      section: `${Number(chapter)}.${rest}`,
      difficulty: 'Beginner → Advanced',
      readingTime: '45 min',
      ...extra,
    },
    `# ${number} ${title}\n\n${body}`,
  );
}
