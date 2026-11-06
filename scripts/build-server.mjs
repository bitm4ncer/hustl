import { build } from 'esbuild'
import { resolve } from 'node:path'

await build({
  entryPoints: {
    index: resolve('src/server/main.ts'),
    cli: resolve('src/server/cli.ts')
  },
  outdir: resolve('dist/server'),
  entryNames: '[name]',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // Nur eigener Code wird gebündelt. Node-Module bleiben extern, damit
  // native Pakete (argon2) und CJS-Pakete (fastify) unangetastet bleiben.
  packages: 'external',
  alias: {
    '@shared': resolve('src/shared')
  },
  logLevel: 'info'
})
