import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { netlifyFunctionsInDev } from './scripts/dev-api.ts'

/** Preloads the Latin file of the interface font, so text does not swap fonts late on the first visit. */
function preloadLatinFont(): Plugin {
  return {
    name: 'preload-latin-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /ibm-plex-sans-latin-wght-normal-[\w-]+\.woff2$/.test(f))
        if (!file) return html
        return {
          html,
          tags: [
            {
              tag: 'link',
              attrs: { rel: 'preload', href: `/${file}`, as: 'font', type: 'font/woff2', crossorigin: '' },
              injectTo: 'head',
            },
          ],
        }
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), netlifyFunctionsInDev(), preloadLatinFont()],
  server: { port: 4000, strictPort: true },
  preview: { port: 4001, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
