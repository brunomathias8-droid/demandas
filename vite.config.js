import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// DEMO=1 gera uma versão de teste sem service worker, com caminhos relativos
const demo = process.env.DEMO === '1';

export default defineConfig({
  base: demo ? './' : '/',
  build: demo ? { outDir: 'dist-demo' } : {},
  plugins: [
    react(),
    !demo && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Demandas',
        short_name: 'Demandas',
        description: 'Capture, organize e não esqueça suas demandas.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0D0E11',
        theme_color: '#0D0E11',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ]
});
