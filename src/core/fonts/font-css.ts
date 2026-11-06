export interface FontWeightUrl { weight: number; url: string }

/** Split CSS into @font-face blocks and pull (weight, woff2 url) from each. */
function parse(css: string, absolutise: (u: string) => string): FontWeightUrl[] {
  const out: FontWeightUrl[] = []
  for (const block of css.split('@font-face')) {
    const w = block.match(/font-weight:\s*(\d+)/)
    const u = block.match(/url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/)
    if (w && u) out.push({ weight: Number(w[1]), url: absolutise(u[1]) })
  }
  // De-dupe by weight (keep first), preserve order.
  const seen = new Set<number>()
  return out.filter((f) => (seen.has(f.weight) ? false : (seen.add(f.weight), true)))
}

export function parseGoogleFontCss(css: string): FontWeightUrl[] {
  return parse(css, (u) => u)
}

export function parseFontshareCss(css: string): FontWeightUrl[] {
  return parse(css, (u) => (u.startsWith('//') ? 'https:' + u : u))
}
