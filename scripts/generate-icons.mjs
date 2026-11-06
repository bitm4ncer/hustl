import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const raw = await readFile(resolve('src/assets/icon.svg'), 'utf8')
const target = resolve('src/renderer/public/icons')
const ORANGE = { r: 255, g: 140, b: 102, alpha: 1 }

await mkdir(target, { recursive: true })

/**
 * Das Zeichen sitzt im Original-SVG klein in der Kachel. Für iOS/Android
 * skalieren wir es um die Mitte, ohne die orange Fläche zu verlassen.
 */
function svgWithGlyphScale(scale) {
  const wrapped = raw.replace(
    /<g transform="matrix\(([^)]*)\)">([\s\S]*?)<\/g>/,
    `<g transform="translate(250 250) scale(${scale}) translate(-250 -250)"><g transform="matrix($1)">$2</g></g>`
  )
  if (wrapped === raw) throw new Error('Glyph-Gruppe im SVG nicht gefunden')
  return Buffer.from(wrapped)
}

const base = await sharp(svgWithGlyphScale(1), { density: 600 })
  .resize(1024, 1024, { fit: 'contain', background: ORANGE })
  .flatten({ background: ORANGE })
  .png()
  .toBuffer()

async function fullBleed(size, name) {
  await sharp(base)
    .resize(size, size, { fit: 'cover' })
    .flatten({ background: ORANGE })
    .png()
    .toFile(resolve(target, name))
}

async function maskable(size, name) {
  const inner = Math.round(size * 0.78)
  const art = await sharp(base)
    .resize(inner, inner, { fit: 'contain', background: ORANGE })
    .png()
    .toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: ORANGE } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(resolve(target, name))
}

// iOS: randlos, deckend. Beide Namen, weil die alte gecachte Shell noch die
// unversionierten Dateien verlinkt — fehlt eine, zeigt iOS einen Buchstaben.
await fullBleed(180, 'apple-touch-icon.png')
await fullBleed(180, 'apple-touch-icon-v2.png')
await fullBleed(180, 'apple-touch-icon-v3.png')
await fullBleed(192, 'icon-192.png')
await fullBleed(192, 'icon-192-v2.png')
await fullBleed(512, 'icon-512.png')
await fullBleed(512, 'icon-512-v2.png')
await maskable(512, 'icon-maskable-512.png')
await maskable(512, 'icon-maskable-512-v2.png')

// Browser-Tab: Firefox/Chrome nutzen weder apple-touch-icon noch Manifest.
await fullBleed(16, 'favicon-16.png')
await fullBleed(32, 'favicon-32.png')
await fullBleed(48, 'favicon-48.png')

/**
 * Echtes /favicon.ico: ICO-Container mit eingebettetem PNG (von Windows und
 * allen Browsern akzeptiert). Firefox fragt diese Datei an, wenn die Seite aus
 * dem Cache kommt — ohne sie bekommt es den SPA-Fallback als HTML.
 */
const png32 = await sharp(base).resize(32, 32, { fit: 'cover' }).flatten({ background: ORANGE }).png().toBuffer()
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
const entry = Buffer.alloc(16)
entry.writeUInt8(32, 0)
entry.writeUInt8(32, 1)
entry.writeUInt8(0, 2)
entry.writeUInt8(0, 3)
entry.writeUInt16LE(1, 4)
entry.writeUInt16LE(32, 6)
entry.writeUInt32LE(png32.length, 8)
entry.writeUInt32LE(22, 12)
await writeFile(resolve('src/renderer/public/favicon.ico'), Buffer.concat([header, entry, png32]))

await writeFile(resolve(target, '.gitkeep'), 'Erzeugt mit npm run icons aus src/assets/icon.svg.\n')

console.log('icons written to', target)
