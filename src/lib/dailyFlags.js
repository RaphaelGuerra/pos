// Deterministic daily-ledger checker per spec (no LLM required)
// Uses pt-BR parsing helpers in src/lib/money.js

import { parsePtbrAmount, toCents, fromCents } from './money.js'

function round2(n) {
  return Math.round(n * 100) / 100
}

function asInt(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function normalizeReceiptAmount(r) {
  // Prefer amount_brl when present; else parse amount_raw (pt-BR)
  if (r == null) return { amount: null, error: 'missing receipt' }
  if (r.amount_brl != null) {
    const n = typeof r.amount_brl === 'number' ? r.amount_brl : parsePtbrAmount(String(r.amount_brl))
    return Number.isFinite(n) ? { amount: round2(n) } : { amount: null, error: 'invalid amount_brl' }
  }
  if (r.amount_raw != null) {
    const n = parsePtbrAmount(String(r.amount_raw))
    return n == null ? { amount: null, error: 'cannot parse amount_raw' } : { amount: n }
  }
  return { amount: null, error: 'missing amount' }
}

/**
 * Compute the strict daily flags verdict.
 * @param {Object} input
 * @param {Array<Object>} input.receipts - Array of receipt objects with { id?, amount_brl?, amount_raw? }
 * @param {Object} input.extract - { total_amount_brl, transaction_count }
 * @param {Object} [input.context] - { date?, currency? }
 * @returns {Object} verdict per schema
 */
export function computeDailyFlags({ receipts, extract, context = {} }) {
  const outErrors = []
  const rlist = Array.isArray(receipts) ? receipts : []
  const receiptsCount = rlist.length

  // Sum using only valid rows; count is number of provided rows
  let sumCents = 0
  for (let i = 0; i < rlist.length; i += 1) {
    const r = rlist[i] || {}
    const rid = r.id ?? String(i + 1)
    const { amount, error } = normalizeReceiptAmount(r)
    if (error) outErrors.push(`${rid}: ${error}`)
    if (amount != null) {
      const cents = toCents(amount)
      if (cents == null) {
        outErrors.push(`${rid}: invalid amount numeric`)
      } else {
        sumCents += cents
      }
    }
  }

  const receiptsSumBrl = fromCents(sumCents) ?? 0

  // Extract normalization
  const extractSum = extract?.total_amount_brl == null
    ? null
    : (typeof extract.total_amount_brl === 'number'
        ? round2(extract.total_amount_brl)
        : parsePtbrAmount(String(extract.total_amount_brl)))

  if (extract && extract.total_amount_brl != null && extractSum == null) {
    outErrors.push('invalid extract.total_amount_brl')
  }

  const extractCount = extract?.transaction_count == null ? null : asInt(extract.transaction_count)
  if (extract && extract.transaction_count != null && extractCount == null) {
    outErrors.push('invalid extract.transaction_count')
  }

  // Deltas (only when both sides present)
  const deltaAmount = extractSum == null ? null : round2(receiptsSumBrl - extractSum)
  const deltaCount = extractCount == null ? null : receiptsCount - extractCount

  // Status classification
  const reasons = []
  let status = 'GREEN'

  // Missing inputs -> GRAY
  if (extractSum == null) reasons.push('missing extract.total_amount_brl')
  if (extractCount == null) reasons.push('missing extract.transaction_count')
  if (receiptsCount === 0) reasons.push('no receipts')

  if (reasons.length > 0) {
    status = 'GRAY'
  } else {
    const sumMatch = deltaAmount === 0
    const countMatch = deltaCount === 0
    if (sumMatch && countMatch) status = 'GREEN'
    else if (sumMatch || countMatch) {
      status = 'YELLOW'
      if (!sumMatch) reasons.push('sum mismatch')
      if (!countMatch) reasons.push('count mismatch')
    } else {
      status = 'RED'
      reasons.push('sum mismatch')
      reasons.push('count mismatch')
    }

    // Parsing errors present: status should be GRAY unless comparison is still possible
    // Comparison is possible when both extract fields are present and we have at least 1 receipt
    if (outErrors.length > 0 && (extractSum == null || extractCount == null || receiptsCount === 0)) {
      status = 'GRAY'
    }
  }

  const verdict = {
    date: context?.date ?? null,
    currency: 'BRL',
    receipts_count: receiptsCount,
    receipts_sum_brl: round2(receiptsSumBrl),
    extract_count: extractCount,
    extract_sum_brl: extractSum,
    delta_count: deltaCount,
    delta_amount_brl: deltaAmount,
    status,
    reasons,
    errors: outErrors,
    needs_manual_review: status !== 'GREEN',
  }

  return verdict
}

/**
 * Build minimal LLM prompt inputs after enforcing pt-BR parsing.
 * This lets the LLM only label/compare rather than parse.
 */
export function buildLLMInputs(receipts, extract, context = {}) {
  const normalizedReceipts = (Array.isArray(receipts) ? receipts : []).map((r, idx) => {
    const rid = r?.id ?? String(idx + 1)
    const pref = r?.amount_brl != null ? r.amount_brl : r?.amount_raw
    const n = r?.amount_brl != null
      ? (typeof r.amount_brl === 'number' ? round2(r.amount_brl) : parsePtbrAmount(String(r.amount_brl)))
      : parsePtbrAmount(String(pref))
    return { id: rid, amount_brl: Number.isFinite(n) ? round2(n) : null }
  })

  const normalizedExtract = {
    total_amount_brl: extract?.total_amount_brl == null
      ? null
      : (typeof extract.total_amount_brl === 'number'
          ? round2(extract.total_amount_brl)
          : parsePtbrAmount(String(extract.total_amount_brl))),
    transaction_count: asInt(extract?.transaction_count),
  }

  return { receipts: normalizedReceipts, extract: normalizedExtract, context }
}

