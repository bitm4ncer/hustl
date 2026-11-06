import puppeteer from 'puppeteer-core'
import type { Browser } from 'puppeteer-core'
import type { PdfRenderer } from '../platform/types'

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser
  browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking'
    ],
    userDataDir: process.env.HUSTL_CHROME_PROFILE ?? '/tmp/chromium'
  })
  return browser
}

// Eine Render-Aufgabe zur Zeit: Chromium ist der größte Speicherverbraucher
// auf dem kleinen VPS.
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)
  return run
}

export const serverPdfRenderer: PdfRenderer = (html, options) =>
  enqueue(async () => {
    const instance = await getBrowser()
    const page = await instance.newPage()
    try {
      await page.setJavaScriptEnabled(false)
      await page.setRequestInterception(true)
      page.on('request', (request) => {
        if (request.url().startsWith('data:')) void request.continue()
        else void request.abort()
      })
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 })
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: options?.displayHeaderFooter ?? false,
        headerTemplate: options?.headerTemplate ?? '<span></span>',
        footerTemplate: options?.footerTemplate ?? '<span></span>',
        margin: {
          top: `${options?.margins?.top ?? 0.79}in`,
          bottom: `${options?.margins?.bottom ?? 0.79}in`,
          left: `${options?.margins?.left ?? 0.59}in`,
          right: `${options?.margins?.right ?? 0.59}in`
        }
      })
      return pdf
    } finally {
      await page.close().catch(() => undefined)
    }
  })

export async function closePdfBrowser(): Promise<void> {
  await browser?.close().catch(() => undefined)
  browser = null
}
