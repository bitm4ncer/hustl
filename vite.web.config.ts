import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html')
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon-v2.png'],
      manifest: {
        name: 'Hustl',
        short_name: 'Hustl',
        description: 'Rechnungen, Angebote und Finanzen',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#141416',
        theme_color: '#141416',
        icons: [
          { src: '/icons/icon-192-v2.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512-v2.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512-v2.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // index.html bleibt bewusst draußen: Workbox würde es als
        // Verzeichnis-Index aus dem Precache beantworten und damit jede
        // Navigation einfrieren. Offline übernimmt die NetworkFirst-Route.
        globPatterns: ['**/*.{js,css,woff2,png,svg}'],
        cleanupOutdatedCaches: true,
        // Ohne Navigations-Fallback: der würde jede Seite aus dem Precache
        // beantworten und die App dauerhaft auf einem alten Bundle festhalten.
        // Offline übernimmt die NetworkFirst-Route mit precacheFallback.
        navigateFallback: null,
        // Navigationen gehen immer erst ins Netz; der precachete Shell ist nur
        // die Notreserve ohne Netz. Sonst hält ein installierter Service Worker
        // die App auf einem alten Bundle fest, obwohl der Server ein neues liefert.
        runtimeCaching: [
          {
            urlPattern: ({ request, url }: { request: Request; url: URL }) =>
              request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hustl-shell',
              networkTimeoutSeconds: 4
            }
          }
        ]
      }
    })
  ]
})
