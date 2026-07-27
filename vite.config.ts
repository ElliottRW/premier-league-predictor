import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' makes the built site work on any GitHub Pages path
// (e.g. https://user.github.io/last-man-standing/) without extra config.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    // In dev, proxy ESPN through the Vite server so local development works
    // behind any browser CORS/network sandbox. Production calls ESPN directly.
    proxy: {
      '/espn': {
        target: 'https://site.api.espn.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/espn/, ''),
      },
      // Proxy the Google Apps Script backend in dev so local development works
      // behind browser CORS/network sandboxes. Production calls it directly
      // (Apps Script sends open CORS headers).
      '/sheet': {
        target: 'https://script.google.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (p) => p.replace(/^\/sheet/, ''),
      },
    },
  },
})
