/** Recursively concatenates the text of a content node. */
export function toPlainText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as { value?: unknown; children?: unknown[] };
  if (typeof record.value === 'string') return record.value;
  return Array.isArray(record.children) ? record.children.map(toPlainText).join('') : '';
}
