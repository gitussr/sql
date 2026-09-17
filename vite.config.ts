/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Vendor code changes far less often than handbook/app code; separate
        // chunks keep it cached across content deploys.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\/](react|react-dom|react-router|scheduler)[\/]/ },
            { name: 'fluent', test: /node_modules[\/](@fluentui|@griffel|tabster|keyborg|@floating-ui|@swc)[\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
