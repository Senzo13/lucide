import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2400,
    /* the site, and the standalone demo of the exportable wall */
    rollupOptions: {
      input: {
        main: 'index.html',
        wall: 'wall.html',
      },
    },
  },
})
