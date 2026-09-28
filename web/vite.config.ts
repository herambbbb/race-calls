import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { predictions } from './plugins/predictions.ts'

// The committed records live in ../predictions (outside the web root). The plugin reads
// and slims them at build time, so dist/ is plain static files.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss(), predictions(repoRoot)],
})
