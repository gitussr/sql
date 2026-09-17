/**
 * Validates handbook content without building the app.
 *
 *   npm run validate:content
 *
 * Exits non-zero when structural errors exist. Warnings are reported but do not fail.
 */
import { fileURLToPath } from 'node:url';
import { formatDiagnostic, summarize, type DiagnosticRule } from './handbook/diagnostics.ts';
import { loadHandbook } from './handbook/load.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const handbook = loadHandbook(root);
const errors = handbook.diagnostics.filter((d) => d.level === 'error');

for (const chapter of handbook.chapters) {
  const detail = chapter.status === 'available' ? `${chapter.sections.length} sections` : 'coming soon';
  console.log(`Chapter ${chapter.number} — ${chapter.title || '(untitled)'}: ${detail}`);
}
console.log('');

const checks: [string, DiagnosticRule[]][] = [
  ['No duplicate section IDs', ['duplicate-id']],
  ['No duplicate slugs', ['duplicate-slug']],
  ['No missing required metadata', ['metadata']],
  ['Section structure valid', ['structure', 'code-block']],
  ['Navigation sequence valid', ['sequence']],
];
for (const [label, rules] of checks) {
  const ok = !errors.some((d) => rules.includes(d.rule));
  console.log(`${ok ? '✓' : '✗'} ${label}`);
}

if (handbook.diagnostics.length > 0) {
  console.log(`\n${summarize(handbook.diagnostics)}`);
  for (const diagnostic of handbook.diagnostics) console.log(formatDiagnostic(diagnostic));
}

process.exitCode = errors.length > 0 ? 1 : 0;
