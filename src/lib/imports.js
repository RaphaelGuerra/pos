import { parsePtbrAmount } from './money.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toText(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeDate(value) {
  const text = toText(value)
  if (!text) return null
  return DATE_RE.test(text) ? text : null
}

function normalizeValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = parsePtbrAmount(trimmed)
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeReceipt(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = toText(raw.id) || createId()
  const date = normalizeDate(raw.date)
  const value = normalizeValue(raw.value)

  const originValue = toText(raw.origin_value) || toText(raw.origin?.value)
  const originDate = toText(raw.origin_date) || toText(raw.origin?.date)
  const origin = originValue || originDate ? { value: originValue, date: originDate } : null

  return {
    id,
    date,
    value,
    pos: toText(raw.pos),
    doc: toText(raw.doc),
    nsu: toText(raw.nsu),
    source: toText(raw.source),
    notes: toText(raw.notes),
    origin,
    draft: Boolean(raw.draft),
  }
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  return cells
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  if (lines.length === 0) return []
  const headers = parseCsvLine(lines[0]).map(h => h.trim())
  if (!headers.length) return []
  const rows = []
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line)
    const row = {}
    headers.forEach((header, idx) => {
      row[header] = cells[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

export function parseImportFile(filename, text) {
  const name = (filename || '').toLowerCase()
  let rawReceipts = null

  if (name.endsWith('.json')) {
    const payload = JSON.parse(text)
    if (Array.isArray(payload)) rawReceipts = payload
    else if (payload && Array.isArray(payload.receipts)) rawReceipts = payload.receipts
    else rawReceipts = []
  } else if (name.endsWith('.csv')) {
    rawReceipts = parseCsv(text)
  } else {
    try {
      const payload = JSON.parse(text)
      if (Array.isArray(payload)) rawReceipts = payload
      else if (payload && Array.isArray(payload.receipts)) rawReceipts = payload.receipts
      else rawReceipts = []
    } catch {
      rawReceipts = parseCsv(text)
    }
  }

  const receipts = rawReceipts.map(normalizeReceipt).filter(Boolean)
  return { receipts }
}

function makeReceiptKey(receipt) {
  if (receipt?.id) return `id:${receipt.id}`
  const date = receipt?.date || ''
  const value = typeof receipt?.value === 'number' ? receipt.value : ''
  const pos = receipt?.pos || ''
  const doc = receipt?.doc || ''
  const nsu = receipt?.nsu || ''
  return `sig:${date}|${value}|${pos}|${doc}|${nsu}`
}

export function mergeReceipts(existing, incoming, activeMonth) {
  const monthPrefix = `${activeMonth}-`
  const merged = [...(existing || [])]
  const known = new Set(merged.map(makeReceiptKey))
  let added = 0
  let skippedDuplicates = 0
  let skippedOutOfMonth = 0

  for (const receipt of incoming || []) {
    if (!receipt) continue
    if (receipt.date && !receipt.date.startsWith(monthPrefix)) {
      skippedOutOfMonth += 1
      continue
    }
    const key = makeReceiptKey(receipt)
    if (known.has(key)) {
      skippedDuplicates += 1
      continue
    }
    known.add(key)
    merged.push(receipt)
    added += 1
  }

  return { merged, added, skippedDuplicates, skippedOutOfMonth }
}
