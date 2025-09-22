import { useMemo, useState } from 'react'
import { parsePtbrAmount as parseBRL } from '../lib/money.js'

function formatBRL(n) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function DailyFlagsPanel({ month, receipts }) {
  // Default to first day of month
  const defaultDay = month ? `${month}-01` : ''
  const [day, setDay] = useState(defaultDay)
  const [extractTotal, setExtractTotal] = useState('')
  const [extractCount, setExtractCount] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const dayReceipts = useMemo(() => {
    return (receipts || []).filter((r) => (r?.date || '') === day)
  }, [receipts, day])

  const countPreview = dayReceipts.length
  const sumPreview = dayReceipts.reduce((acc, r) => acc + (typeof r.value === 'number' ? r.value : 0), 0)

  async function runCheck() {
    setError('')
    setResult(null)
    const totalNum = extractTotal === '' ? null : parseBRL(extractTotal)
    const countNum = extractCount === '' ? null : (Number.isFinite(Number(extractCount)) ? Number(extractCount) : null)
    if (totalNum == null || countNum == null) {
      setError('Informe total e contagem do provedor (formatos válidos).')
      return
    }
    setLoading(true)
    try {
      const payload = {
        receipts: dayReceipts.map((r) => ({ id: r.id, amount_brl: typeof r.value === 'number' ? r.value : null })),
        extract: { total_amount_brl: totalNum, transaction_count: countNum },
        context: { date: day, currency: 'BRL' },
      }
      const res = await fetch('/api/daily-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`HTTP ${res.status}: ${txt}`)
      }
      const json = await res.json()
      setResult(json)
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setLoading(false)
    }
  }

  function StatusBadge({ status }) {
    const s = String(status || 'GRAY').toUpperCase()
    const color = s === 'GREEN' ? 'var(--success)'
      : s === 'YELLOW' ? 'var(--warn)'
      : s === 'RED' ? 'var(--danger)'
      : 'var(--muted)'
    const style = { display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: color, color: '#000', fontWeight: 600 }
    return <span style={style}>{s}</span>
  }

  return (
    <section className="section">
      <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Daily Flags
        {result ? <StatusBadge status={result.status} /> : null}
      </h2>

      <div className="summary" style={{ alignItems: 'flex-end' }}>
        <div className="card" style={{ minWidth: 220 }}>
          <div className="label">Dia</div>
          <input className="cell-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="card" style={{ minWidth: 220 }}>
          <div className="label">Total do provedor (R$)</div>
          <input className="cell-input" inputMode="decimal" placeholder="0,00" value={extractTotal} onChange={(e) => setExtractTotal(e.target.value)} />
        </div>
        <div className="card" style={{ minWidth: 220 }}>
          <div className="label">Contagem do provedor</div>
          <input className="cell-input" inputMode="numeric" placeholder="0" value={extractCount} onChange={(e) => setExtractCount(e.target.value)} />
        </div>
        <div className="card" style={{ minWidth: 180 }}>
          <div className="label">Prévia (app)</div>
          <div className="value">{countPreview} • {formatBRL(sumPreview)}</div>
        </div>
        <div className="card" style={{ minWidth: 160, alignItems: 'center' }}>
          <button className="primary" onClick={runCheck} disabled={loading || !day}>
            {loading ? 'Checando…' : 'Checar'}
          </button>
        </div>
      </div>

      {error ? <div className="hint" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div> : null}

      {result ? (
        <div style={{ marginTop: 12 }}>
          <div className="summary">
            <div className="card"><div className="label">Status</div><div className="value"><StatusBadge status={result.status} /></div></div>
            <div className="card"><div className="label">Delta valor</div><div className="value">{formatBRL(result.delta_amount_brl)}</div></div>
            <div className="card"><div className="label">Delta contagem</div><div className="value">{Number.isFinite(result.delta_count) ? result.delta_count : '—'}</div></div>
            <div className="card"><div className="label">Extrato</div><div className="value">{formatBRL(result.extract_sum_brl)} • {result.extract_count ?? '—'}</div></div>
            <div className="card"><div className="label">Recebidos</div><div className="value">{formatBRL(result.receipts_sum_brl)} • {result.receipts_count}</div></div>
          </div>

          {result.reasons?.length ? (
            <div className="hint" style={{ marginTop: 8 }}>Motivos: {result.reasons.join(', ')}</div>
          ) : null}
          {result.errors?.length ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Erros de entrada ({result.errors.length})</summary>
              <ul className="receipt-list">
                {result.errors.map((e, i) => <li key={i} className="receipt-item"><div>{e}</div></li>)}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

