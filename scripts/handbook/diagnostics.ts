export type DiagnosticRule =
  | 'metadata'
  | 'duplicate-id'
  | 'duplicate-slug'
  | 'sequence'
  | 'code-block'
  | 'reference'
  | 'structure';

export interface Diagnostic {
  level: 'error' | 'warning';
  rule: DiagnosticRule;
  file?: string;
  line?: number;
  message: string;
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = diagnostic.file ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}: ` : '';
  return `${diagnostic.level === 'error' ? '✗' : '⚠'} ${location}${diagnostic.message}`;
}

export function summarize(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.level === 'error').length;
  const warnings = diagnostics.length - errors;
  return `${errors} error(s), ${warnings} warning(s)`;
}
