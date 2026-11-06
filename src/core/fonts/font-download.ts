import fs from 'node:fs/promises'
import path from 'node:path'
import type { TemplateFontFile, TemplateFontSource } from '@shared/types'
import { parseGoogleFontCss, parseFontshareCss, type FontWeightUrl } from './font-css'
import { toStoredPath } from '../paths'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function cssFor(family: string, source: TemplateFontSource): Promise<FontWeightUrl[]> {
  if (source === 'google') {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`
    const css = await fetch(url, { headers: { 'User-Agent': UA } }).then((r) => r.text())
    const got = parseGoogleFontCss(css)
    if (got.length) return got
    // Some families lack 700 — retry 400 only.
    const css400 = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`, { headers: { 'User-Agent': UA } }).then((r) => r.text())
    return parseGoogleFontCss(css400)
  }
  const css = await fetch(`https://api.fontshare.com/v2/css?f[]=${slugify(family)}@400,700`).then((r) => r.text())
  return parseFontshareCss(css)
}

/** Download a family's woff2 files into userData/template/fonts/<slug>/ and
 *  return the local TemplateFontFile[]. Throws on network failure / no faces. */
export async function downloadFont(
  family: string,
  source: TemplateFontSource,
  userDataDir: string,
): Promise<TemplateFontFile[]> {
  const faces = await cssFor(family, source)
  if (!faces.length) throw new Error(`Keine Schriftdateien für „${family}" gefunden.`)
  const dir = path.join(userDataDir, 'template', 'fonts', slugify(family))
  await fs.mkdir(dir, { recursive: true })
  const files: TemplateFontFile[] = []
  for (const f of faces) {
    const buf = await fetch(f.url, { headers: { 'User-Agent': UA } }).then((r) => r.arrayBuffer())
    const bytes = Buffer.from(buf)
    const dest = path.join(dir, `${f.weight}.woff2`)
    await fs.writeFile(dest, bytes)
    files.push({ weight: f.weight, path: toStoredPath(userDataDir, dest) })
  }
  return files
}
