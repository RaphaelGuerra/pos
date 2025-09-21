// UTC-safe date helpers and month labels (pt-BR)

export function formatDDMM(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return ''
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const [, , mm, dd] = m
  return `${dd}/${mm}`
}

export function getWeekdayShort(isoDate) {
  try {
    const [y, m, d] = isoDate.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dt)
  } catch { return '' }
}

export function getMonthDisplayName(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, 1))
  const s = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function incMonth(monthStr, delta) {
  const [year, month] = monthStr.split('-').map(Number)
  let newYear = year
  let newMonth = month + delta
  while (newMonth > 12) { newMonth -= 12; newYear += 1 }
  while (newMonth < 1) { newMonth += 12; newYear -= 1 }
  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}

export function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days = []
  for (let d = 1; d <= last; d++) {
    days.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

