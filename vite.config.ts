/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { handbookPlugin } from './scripts/handbook/vitePlugin.ts';

/** Handbook Markdown lives at the repository root. */
const contentDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), handbookPlugin(contentDirectory)],
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
