import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { netlifyFunctionsInDev } from './scripts/dev-api.ts'

export default defineConfig({
  plugins: [react(), netlifyFunctionsInDev()],
  server: { port: 4000, strictPort: true },
  preview: { port: 4001, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
