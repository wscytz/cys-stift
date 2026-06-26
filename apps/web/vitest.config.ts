import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * M3 — vitest config. jsdom env (so `window.matchMedia` and similar web
 * APIs the modules touch are defined; pure-logic tests don't need it but
 * it's cheap to set globally). The `@/` alias mirrors the Next.js
 * tsconfig so test imports match production imports.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // React 19 automatic JSX runtime. App components (built by Next.js) get
  // this via the Next SWC; under vitest we must opt esbuild into the same
  // `react-jsx` transform so components that use JSX without an explicit
  // `import React` (the Next.js convention) render correctly in tests.
  esbuild: {
    jsx: 'automatic',
  },
})