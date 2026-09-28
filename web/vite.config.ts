import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The committed records live in ../predictions (outside the web root); the dev server
// must be allowed to read them. The build inlines them, so dist/ is plain static files.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: [repoRoot] } },
})
