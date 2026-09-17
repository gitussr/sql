import { join } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { formatDiagnostic, summarize } from './diagnostics.ts';
import { loadHandbook, type Handbook } from './load.ts';

const MANIFEST_ID = 'virtual:handbook';
const SECTION_PREFIX = 'virtual:handbook/section/';
const OVERVIEW_PREFIX = 'virtual:handbook/overview/';

/**
 * Imports the handbook Markdown at build time.
 *
 * - `virtual:handbook` exports chapter metadata plus lazy loaders.
 * - Each section body is its own module, so it becomes its own chunk.
 *
 * Structural errors fail `vite build`; in dev they surface as an import error.
 */
export function handbookPlugin(contentDirectory: string): Plugin {
  let handbook: Handbook | undefined;
  let command: 'build' | 'serve' = 'serve';

  const load = (): Handbook => {
    if (handbook) return handbook;
    const result = loadHandbook(contentDirectory);
    const errors = result.diagnostics.filter((d) => d.level === 'error');
    // Tests assert on diagnostics directly; `npm run validate:content` prints them in full.
    if (result.diagnostics.length > 0 && !process.env.VITEST) {
      const lines = result.diagnostics.map(formatDiagnostic).join('\n');
      console.warn(`\n[handbook] ${summarize(result.diagnostics)}\n${lines}\n`);
    }
    if (errors.length > 0) {
      throw new Error(`[handbook] Content validation failed:\n${errors.map(formatDiagnostic).join('\n')}`);
    }
    handbook = result;
    return result;
  };

  return {
    name: 'sql-guide-handbook',

    configResolved(config) {
      command = config.command;
    },

    buildStart() {
      if (command === 'build') {
        const result = load();
        result.files.forEach((file) => this.addWatchFile(join(contentDirectory, file)));
      }
    },

    configureServer(server: ViteDevServer) {
      server.watcher.add(join(contentDirectory, '*.md'));
      server.watcher.on('all', (_event, path) => {
        if (!path.endsWith('.md')) return;
        handbook = undefined;
        for (const module of server.moduleGraph.idToModuleMap.values()) {
          if (module.id?.startsWith(`\0${MANIFEST_ID}`)) server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      });
    },

    resolveId(id) {
      if (id === MANIFEST_ID || id.startsWith(`${MANIFEST_ID}/`)) return `\0${id}`;
      return undefined;
    },

    load(id) {
      if (!id.startsWith(`\0${MANIFEST_ID}`)) return undefined;
      const { chapters, sections, overviews } = load();
      const moduleId = id.slice(1);

      if (moduleId === MANIFEST_ID) {
        const loaders = (prefix: string, keys: Iterable<string>) =>
          `{${[...keys].map((key) => `${JSON.stringify(key)}: () => import(${JSON.stringify(prefix + moduleKey(key))})`).join(',')}}`;
        return [
          `export const chapters = ${jsonModule(chapters)};`,
          `export const sectionLoaders = ${loaders(SECTION_PREFIX, sections.keys())};`,
          `export const overviewLoaders = ${loaders(OVERVIEW_PREFIX, overviews.keys())};`,
        ].join('\n');
      }

      const content = moduleId.startsWith(SECTION_PREFIX)
        ? findByModuleKey(sections, moduleId.slice(SECTION_PREFIX.length))
        : moduleId.startsWith(OVERVIEW_PREFIX)
          ? findByModuleKey(overviews, moduleId.slice(OVERVIEW_PREFIX.length))
          : undefined;
      if (!content) throw new Error(`[handbook] Unknown content module ${moduleId}`);
      return `export default ${jsonModule(content)};`;
    },
  };
}

/**
 * Module ids must not contain dots: in dev, Vite would read "05.07" as a file
 * extension and serve the SPA fallback instead of the module.
 */
function moduleKey(key: string): string {
  return key.replaceAll('.', '-');
}

function findByModuleKey<T>(map: Map<string, T>, key: string): T | undefined {
  for (const [entryKey, value] of map) if (moduleKey(entryKey) === key) return value;
  return undefined;
}

/** JSON.parse of a string literal is faster to evaluate than an equivalent object literal. */
function jsonModule(value: unknown): string {
  return `JSON.parse(${JSON.stringify(JSON.stringify(value))})`;
}
