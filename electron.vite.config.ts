import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          setup: resolve(__dirname, 'src/preload/setup.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [
      react(),
      {
        // Die Desktop-App registriert keinen Service Worker. Ohne Stub scheitert
        // der Rollup-Build an `import('virtual:pwa-register')`, weil das
        // PWA-Plugin nur im Web-Build aktiv ist.
        name: 'pwa-register-stub',
        resolveId(id) {
          if (id === 'virtual:pwa-register') return '\0virtual:pwa-register-stub'
          return null
        },
        load(id) {
          if (id === '\0virtual:pwa-register-stub') {
            return 'export function registerSW() { return async () => {} }'
          }
          return null
        }
      }
    ]
  }
})
