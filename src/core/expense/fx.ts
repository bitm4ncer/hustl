/* Currency conversion to EUR using the ECB euro reference rates (free, no key).
 * The full history CSV is fetched once and cached locally; conversions are then
 * fully offline. Rates are "units of currency per 1 EUR" (ECB convention), so
 * EUR = amount / rate. */
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'

const TRACKED = ['USD', 'GBP', 'CHF'] as const
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.csv'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface FxRates {
  dates: string[] // sorted ascending 'YYYY-MM-DD'
  rates: Record<string, Partial<Record<string, number>>> // date -> { USD: perEUR, ... }
}

// Rough fallback if ECB is unreachable and there is no cache (units per 1 EUR).
const FALLBACK: Record<string, number> = { USD: 1.08, GBP: 0.85, CHF: 0.95 }

const r2 = (n: number): number => Math.round(n * 100) / 100

export function parseEcbCsv(csv: string): FxRates {
  const lines = csv.trim().split(/\r?\n/)
  const header = lines[0].split(',').map((h) => h.trim())
  const colOf: Record<string, number> = {}
  for (const c of TRACKED) {
    const i = header.indexOf(c)
    if (i !== -1) colOf[c] = i
  }
  const rates: FxRates['rates'] = {}
  const dates: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const date = (cols[0] ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const row: Partial<Record<string, number>> = {}
    for (const c of TRACKED) {
      const v = Number((cols[colOf[c]] ?? '').trim())
      if (Number.isFinite(v) && v > 0) row[c] = v
    }
    if (Object.keys(row).length) {
      rates[date] = row
      dates.push(date)
    }
  }
  dates.sort()
  return { dates, rates }
}

// Reject implausible/garbled data (e.g. a proxy stub) so it never corrupts the
// books: real ECB history has hundreds of distinct USD rates around ~1.0–1.2.
export function looksPlausible(fx: FxRates): boolean {
  const usd = fx.dates.map((d) => fx.rates[d]?.USD).filter((v): v is number => v != null)
  if (usd.length < 100) return false
  if (new Set(usd).size < 50) return false
  const latest = usd[usd.length - 1]
  return latest >= 0.8 && latest <= 1.6
}

// Nearest rate on or before isoDate; else the earliest available; else fallback.
export function rateOn(fx: FxRates, isoDate: string | null, currency: string): number | null {
  if (fx.dates.length === 0) return FALLBACK[currency] ?? null
  const target = isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : fx.dates[fx.dates.length - 1]
  let lo = 0
  let hi = fx.dates.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (fx.dates[mid] <= target) {
      idx = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  for (let i = idx === -1 ? 0 : idx; i >= 0; i--) {
    const v = fx.rates[fx.dates[i]]?.[currency]
    if (v) return v
  }
  for (let i = 0; i < fx.dates.length; i++) {
    const v = fx.rates[fx.dates[i]]?.[currency]
    if (v) return v
  }
  return FALLBACK[currency] ?? null
}

export function convertToEur(amount: number, currency: string, isoDate: string | null, fx: FxRates): number {
  if (currency === 'EUR') return r2(amount)
  const rate = rateOn(fx, isoDate, currency) ?? FALLBACK[currency]
  if (!rate) return r2(amount) // unknown currency -> leave as-is
  return r2(amount / rate)
}

export async function loadFxRates(cacheDir?: string): Promise<FxRates> {
  const dir = cacheDir ?? path.join(os.homedir(), 'Library', 'Application Support', 'hustl')
  const cacheFile = path.join(dir, 'fx-rates.json')
  try {
    const stat = await fs.stat(cacheFile)
    if (Date.now() - stat.mtimeMs < MAX_AGE_MS) {
      const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8')) as FxRates
      if (looksPlausible(cached)) return cached
    }
  } catch {
    /* no cache yet */
  }
  try {
    const res = await fetch(ECB_URL)
    const csv = await res.text()
    const fx = parseEcbCsv(csv)
    if (looksPlausible(fx)) {
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(cacheFile, JSON.stringify(fx))
      return fx
    }
  } catch {
    /* offline — fall through to stale cache / fallback */
  }
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8')) as FxRates
    if (looksPlausible(cached)) return cached
  } catch {
    /* none */
  }
  // No trustworthy data -> empty table; convertToEur() then uses FALLBACK rates.
  return { dates: [], rates: {} }
}
