/** Lowercase URL/anchor slug. `&` and `*` are spelled out so titles like "SELECT *" keep their meaning. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\*/g, ' all ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Produces unique anchor ids within one page. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = slugify(text) || 'section';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}

/** Recursively concatenates the text of a Markdown node. */
export function toPlainText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as { value?: unknown; children?: unknown[] };
  if (typeof record.value === 'string') return record.value;
  return Array.isArray(record.children) ? record.children.map(toPlainText).join('') : '';
}

/** Treats " - ", " — " and " – " separators as equivalent when comparing titles. */
export function normalizeTitle(text: string): string {
  return text
    .replace(/\s+[-—–]\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Numeric-aware ordering for section numbers like "05.9" < "05.10" and "03.08.09.02". */
export function compareSectionNumbers(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}
