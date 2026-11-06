import { describe, it, expect } from 'vitest'
import { parseGoogleFontCss, parseFontshareCss } from '../../../src/core/fonts/font-css'

const GOOGLE = `@font-face{font-family:'Manrope';font-weight:400;src:url(https://fonts.gstatic.com/s/manrope/v20/a.woff2) format('woff2');}
@font-face{font-family:'Manrope';font-weight:700;src:url(https://fonts.gstatic.com/s/manrope/v20/b.woff2) format('woff2');}`

const FONTSHARE = `@font-face{font-family:'Satoshi';font-weight:400;src:url('//cdn.fontshare.com/wf/X/Y/a.woff2') format('woff2');}
@font-face{font-family:'Satoshi';font-weight:700;src:url('//cdn.fontshare.com/wf/X/Y/b.woff2') format('woff2');}`

describe('font-css parsers', () => {
  it('parses Google css2 into weight+url pairs', () => {
    expect(parseGoogleFontCss(GOOGLE)).toEqual([
      { weight: 400, url: 'https://fonts.gstatic.com/s/manrope/v20/a.woff2' },
      { weight: 700, url: 'https://fonts.gstatic.com/s/manrope/v20/b.woff2' },
    ])
  })
  it('parses Fontshare css and absolutises protocol-relative urls', () => {
    expect(parseFontshareCss(FONTSHARE)).toEqual([
      { weight: 400, url: 'https://cdn.fontshare.com/wf/X/Y/a.woff2' },
      { weight: 700, url: 'https://cdn.fontshare.com/wf/X/Y/b.woff2' },
    ])
  })
})
