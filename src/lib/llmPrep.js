import { parsePtbrAmount } from './money.js'

/**
 * Normalize a value-like field to a BRL number, or null.
 * @param {any} v
 * @returns {number|null}
 */
function normalizeAmount(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
  }
  return parsePtbrAmount(String(v))
}

/**
 * Prepare day input for an LLM that only compares and classifies.
 * Mirrors the Python wrapper behavior from the example.
 *
 * receipts: list of objects, each may include:
 *  - id: string
 *  - value | amount_brl: number|string (optional)
 *  - value_raw | amount_raw: string (optional, e.g., '400,00')
 * extract: object with
 *  - total_amount_brl: number|string
 *  - transaction_count: number
 * context: optional object (e.g., date, currency)
 *
 * @param {Array<Object>} receipts
 * @param {Object} extract
 * @param {Object} [context]
 */
export function prepareDayInput(receipts, extract, context = {}) {
  const parsedReceipts = []
  const errors = []

  for (let i = 0; i < (receipts || []).length; i++) {
    const r = receipts[i] || {}
    const rid = r.id ?? String(i + 1)

    let amt = null
    if (r.value != null) {
      amt = normalizeAmount(r.value)
      if (amt == null) errors.push(`invalid value in ${rid}`)
    } else if (r.amount_brl != null) {
      amt = normalizeAmount(r.amount_brl)
      if (amt == null) errors.push(`invalid amount_brl in ${rid}`)
    } else if (r.value_raw) {
      amt = normalizeAmount(r.value_raw)
      if (amt == null) errors.push(`cannot parse value_raw in ${rid}`)
    } else if (r.amount_raw) {
      amt = normalizeAmount(r.amount_raw)
      if (amt == null) errors.push(`cannot parse amount_raw in ${rid}`)
    } else {
      errors.push(`missing amount in ${rid}`)
    }

    parsedReceipts.push({ id: rid, amount_brl: amt })
  }

  const totalAmount = normalizeAmount(extract?.total_amount_brl)
  const txCount = typeof extract?.transaction_count === 'number'
    ? extract.transaction_count
    : Number.isFinite(Number(extract?.transaction_count))
      ? Number(extract.transaction_count)
      : undefined

  if (extract && extract.total_amount_brl != null && totalAmount == null) {
    errors.push('invalid extract.total_amount_brl')
  }

  return {
    receipts: parsedReceipts.map(r => ({ id: r.id, amount_brl: r.amount_brl })),
    extract: { total_amount_brl: totalAmount ?? null, transaction_count: txCount },
    context: context || {},
    errors,
  }
}

