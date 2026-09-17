/// <reference types="vitest/config" />
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import { handbookPlugin } from './scripts/handbook/vitePlugin.ts';

/** Handbook Markdown lives at the repository root. */
const contentDirectory = fileURLToPath(new URL('.', import.meta.url));

/**
 * GitHub Pages project sites are served from /<repo>/, so the build needs a
 * matching base. BASE_PATH is set by the Pages workflow; other hosts (Vercel)
 * serve from the root and leave it unset.
 */
const base = process.env.BASE_PATH || '/';

/**
 * Static-host fallbacks for the single-page app: 404.html makes GitHub Pages
 * serve the app for deep links, and .nojekyll stops Jekyll from dropping
 * asset directories it considers private.
 */
function staticFallbacks(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'handbook:static-fallbacks',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = join(config.root, config.build.outDir);
      copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'));
      writeFileSync(join(outDir, '.nojekyll'), '');
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), handbookPlugin(contentDirectory), staticFallbacks()],
  build: {
    rolldownOptions: {
      output: {
        chunkFileNames: (chunk) => {
          const content = chunk.facadeModuleId?.match(/virtual:handbook\/(section|overview)\/(.+)$/);
          return content ? `assets/${content[1]}-${content[2]}-[hash].js` : 'assets/[name]-[hash].js';
        },
        // Vendor code changes far less often than handbook/app code; separate
        // chunks keep it cached across content deploys.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'fluent', test: /node_modules[\\/](@fluentui|@griffel|tabster|keyborg|@floating-ui|@swc)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
