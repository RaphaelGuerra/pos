// Money helpers for pt-BR currency parsing and formatting

/**
 * Parse pt-BR formatted money (e.g., '1.234,56' or 'R$ 120,00') to Number.
 * Returns null if parsing fails. Rounds to 2 decimals.
 * @param {string | number | null | undefined} raw
 * @returns {number | null}
 */
export function parsePtbrAmount(raw) {
  if (raw == null || raw === '') return null
  try {
    const s = String(raw)
      .trim()
      // remove everything except digits, separators and minus sign
      .replace(/[^0-9,.-]/g, '')
      // drop thousands separators like 1.234.567,89 → 1234567,89
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      // turn decimal comma into dot
      .replace(',', '.')
    if (!/[0-9]/.test(s)) return null
    const n = Number(s)
    if (!Number.isFinite(n)) return null
    return Math.round(n * 100) / 100
  } catch {
    return null
  }
}

/**
 * Convert a decimal BRL number to integer cents safely.
 * Returns null if invalid.
 * @param {number | string} amount
 */
export function toCents(amount) {
  const n = typeof amount === 'number' ? amount : parsePtbrAmount(amount)
  if (n == null) return null
  const cents = Math.round(n * 100)
  if (!Number.isFinite(cents)) return null
  return cents
}

/**
 * Convert integer cents to decimal BRL number.
 * @param {number} cents
 */
export function fromCents(cents) {
  if (!Number.isFinite(cents)) return null
  return Math.round(cents) / 100
}
