export function formatNumber(year: number, counter: number): string {
  return `${year}${String(counter).padStart(3, '0')}`
}

export function parseNumber(value: string): { year: number; counter: number } {
  return { year: Number(value.slice(0, 4)), counter: Number(value.slice(4)) }
}

export function nextNumber(
  seq: { year: number; lastNumber: number },
  currentYear: number
): { year: number; counter: number; value: string } {
  const counter = currentYear === seq.year ? seq.lastNumber + 1 : 1
  return { year: currentYear, counter, value: formatNumber(currentYear, counter) }
}
