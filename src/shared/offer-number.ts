export function formatOfferNumber(prefix: string, year: number, counter: number): string {
  return `${prefix}-${year}-${String(counter).padStart(3, '0')}`
}

export function nextOfferNumber(
  seq: { year: number; lastNumber: number },
  currentYear: number,
  prefix: string,
): { year: number; counter: number; value: string } {
  const counter = currentYear === seq.year ? seq.lastNumber + 1 : 1
  return { year: currentYear, counter, value: formatOfferNumber(prefix, currentYear, counter) }
}
