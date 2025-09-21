function download(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function toCSV(receipts) {
  const cols = ['id','day','value','date','pos','doc','nsu','source','notes','origin_value','origin_date']
  const lines = [cols.join(',')]
  for (const r of receipts || []) {
    const row = [
      r.id ?? '',
      r.date ? r.date.slice(8,10) : '',
      typeof r.value === 'number' ? r.value.toFixed(2) : '',
      r.date ?? '',
      r.pos ?? '',
      r.doc ?? '',
      r.nsu ?? '',
      r.source ?? '',
      (r.notes ?? '').replace(/[\n\r]+/g,' ').replace(/[",]/g,' '),
      r.origin?.value ?? '',
      r.origin?.date ?? '',
    ]
    lines.push(row.map(cell => typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : String(cell)).join(','))
  }
  return lines.join('\n')
}

export function downloadCSV(filename, receipts) {
  download(filename, toCSV(receipts), 'text/csv;charset=utf-8')
}

export function downloadJSON(filename, receipts) {
  const content = JSON.stringify({ version: 1, receipts: receipts || [] }, null, 2)
  download(filename, content, 'application/json;charset=utf-8')
}

