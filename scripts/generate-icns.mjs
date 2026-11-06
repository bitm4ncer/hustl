import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

/**
 * Baut build/icon.icns aus build/icon.png. electron-builder erwartet für
 * macOS ein ICNS; die PNG-Variante wird hier in die üblichen Größen
 * (16–1024 px) verpackt.
 */
const source = await readFile(resolve('build/icon.png'))

const sizes = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512]
]

const chunks = []
for (const [type, size] of sizes) {
  const png = await sharp(source)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()

  const header = Buffer.alloc(8)
  header.write(type, 0, 4, 'ascii')
  header.writeUInt32BE(png.length + 8, 4)
  chunks.push(header, png)
}

const body = Buffer.concat(chunks)
const header = Buffer.alloc(8)
header.write('icns', 0, 4, 'ascii')
header.writeUInt32BE(body.length + 8, 4)

await writeFile(resolve('build/icon.icns'), Buffer.concat([header, body]))
console.log('build/icon.icns written')
