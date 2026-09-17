import { describe, expect, it } from 'vitest';
import type { HandbookConfig } from './config.ts';
import { buildHandbook } from './load.ts';
import { markdownFile, overviewFile, sectionFile } from './testing.ts';

const config: HandbookConfig = {
  chapters: [
    { number: '05', status: 'available' },
    { number: '06', status: 'coming-soon', title: 'WHERE Clause' },
  ],
};

const errors = (files: Parameters<typeof buildHandbook>[0]) =>
  buildHandbook(files, config).diagnostics.filter((d) => d.level === 'error');

describe('buildHandbook metadata', () => {
  it('derives chapters and sections from frontmatter', () => {
    const handbook = buildHandbook(
      [overviewFile(), sectionFile('05.02', 'SELECT Syntax'), sectionFile('05.01', 'Introduction to SELECT'), sectionFile('05.03', 'SELECT *')],
      config,
    );
    expect(handbook.diagnostics).toEqual([]);
    const [chapter, comingSoon] = handbook.chapters;
    expect(chapter).toMatchObject({ number: '05', title: 'SELECT Statement', slug: 'select-statement', status: 'available', hasOverview: true });
    expect(chapter!.sections.map((s) => [s.number, s.slug])).toEqual([
      ['05.01', '05-01-introduction-to-select'],
      ['05.02', '05-02-select-syntax'],
      ['05.03', '05-03-select-all'],
    ]);
    expect(chapter!.sections[0]).toMatchObject({ readingTime: 45, difficulty: 'Beginner → Advanced', type: 'article' });
    expect(comingSoon).toMatchObject({ number: '06', title: 'WHERE Clause', slug: 'where-clause', status: 'coming-soon', sections: [] });
  });

  it('reads "section: 5.10" as text, not the number 5.1', () => {
    const handbook = buildHandbook([overviewFile(), sectionFile('05.10', 'SELECT into Variables')], config);
    expect(handbook.diagnostics).toEqual([]);
    expect(handbook.chapters[0]!.sections[0]!.number).toBe('05.10');
  });

  it('ignores files from chapters that are not published', () => {
    const handbook = buildHandbook([overviewFile(), sectionFile('05.01', 'A'), sectionFile('04.01', 'SQL Syntax'), { name: 'Chapter 03.01 - X.md', text: '# no frontmatter' }], config);
    expect(handbook.diagnostics).toEqual([]);
    expect(handbook.files).not.toContain('Chapter 04.01 - SQL Syntax.md');
  });
});

describe('buildHandbook validation', () => {
  it('fails on duplicate section ids', () => {
    const result = errors([overviewFile(), sectionFile('05.01', 'A'), { ...sectionFile('05.01', 'A'), name: 'Chapter - 05.01 - A.md' }]);
    expect(result.map((d) => d.rule)).toEqual(['duplicate-id']);
  });

  it('fails on duplicate slugs', () => {
    const files = [overviewFile(), sectionFile('05.01', 'A'), sectionFile('05.02', 'B')];
    const handbook = buildHandbook(files, config);
    expect(handbook.diagnostics).toEqual([]);
    // Different numbers always produce different slugs; duplicate chapter slugs are still caught.
    const clash = buildHandbook([...files, overviewFile('06', 'SELECT Statement'), sectionFile('06.01', 'C')], {
      chapters: [
        { number: '05', status: 'available' },
        { number: '06', status: 'available' },
      ],
    });
    expect(clash.diagnostics.filter((d) => d.level === 'error').map((d) => d.rule)).toEqual(['duplicate-slug']);
  });

  it('fails on missing required frontmatter', () => {
    const file = markdownFile('Chapter 05.01 - A.md', { title: '"05.01 - A"', chapter: '5', section: '5.01' }, '# 05.01 A');
    expect(errors([overviewFile(), sectionFile('05.02', 'B'), file]).map((d) => d.message)).toEqual(['Missing required frontmatter: description.']);
  });

  it('fails when a published chapter file has no frontmatter', () => {
    expect(errors([overviewFile(), sectionFile('05.02', 'B'), { name: 'Chapter 05.01 - A.md', text: '# 05.01 A' }]).map((d) => d.message)).toEqual([
      'Missing frontmatter.',
    ]);
  });

  it('fails when the frontmatter section number disagrees with the title', () => {
    expect(errors([overviewFile(), sectionFile('05.01', 'A', 'Text.', { section: '5.02' })]).map((d) => d.rule)).toContain('metadata');
  });

  it('fails when the title heading disagrees with the frontmatter title', () => {
    const file = markdownFile('Chapter 05.01 - A.md', { title: '"05.01 - A"', description: 'd', chapter: '5', section: '5.01' }, '# 05.01 Something Else');
    expect(errors([overviewFile(), file])[0]?.message).toBe('Title heading "05.01 Something Else" does not match frontmatter title "05.01 A".');
  });

  it('fails when a chapter has no introduction or no sections', () => {
    expect(errors([sectionFile('05.01', 'A')]).map((d) => d.message)).toEqual([
      'Chapter 05 has no introduction file ("Chapter 05 - <Title>").',
    ]);
    expect(errors([overviewFile()]).map((d) => d.message)).toEqual(['Chapter 05 has no sections.']);
  });

  it('fails on an unclosed code block', () => {
    const result = errors([overviewFile(), sectionFile('05.01', 'A', '# Example\n\n```sql\nSELECT 1;\n\n# Summary\n\nDone.')]);
    expect(result.map((d) => d.rule)).toEqual(['code-block']);
    expect(result[0]!.line).toBe(14);
  });

  it('warns about numbering gaps, unlabelled code blocks and stray fences without failing', () => {
    const handbook = buildHandbook(
      [overviewFile(), sectionFile('05.01', 'A', '```\nplain\n```\n\nEnds badly.````'), sectionFile('05.03', 'C')],
      config,
    );
    expect(handbook.diagnostics.every((d) => d.level === 'warning')).toBe(true);
    expect(handbook.diagnostics.map((d) => d.message)).toEqual([
      'Chapter 05: section numbering jumps from 05.01 to 05.03.',
      'Paragraph ends with a stray code fence (```).',
      '1 code block(s) without a language (lines 12).',
    ]);
  });
});
