/** Receipt helpers */

/**
 * Group receipts by day within a month; missing date go to unknown.
 * @param {Array} receipts
 * @param {string} month YYYY-MM
 */
export function groupByDay(receipts, month) {
  const byDay = {}
  const unknown = []
  for (const r of receipts || []) {
    const d = r?.date || ''
    if (!d) { unknown.push(r); continue }
    if (!d.startsWith(month)) continue
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(r)
  }
  return { byDay, unknown }
}

export function countPending(receipts /*, month */) {
  return (receipts || []).filter(r => (!r?.value || !r?.date)).length
}

export function totals(receipts, month) {
  const res = { perDay: {}, monthTotal: 0, unknownTotal: 0 }
  for (const r of receipts || []) {
    const d = r?.date || ''
    const val = typeof r?.value === 'number' ? r.value : 0
    if (!d) { res.unknownTotal += val; continue }
    if (!d.startsWith(month)) continue
    res.perDay[d] = (res.perDay[d] || 0) + val
    res.monthTotal += val
  }
  return res
}
