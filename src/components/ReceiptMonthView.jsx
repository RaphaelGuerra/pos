import { formatDDMM, getWeekdayShort } from '../lib/date.js'

function formatBRL(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)
}

export default function ReceiptMonthView({ month, groups, totals, onDelete, onEdit }) {
  const days = Object.keys(groups.byDay).sort()
  const unknown = groups.unknown || []
  const monthTotal = totals.monthTotal || 0

  return (
    <div>
      <section className="section">
        <h2 className="section-title">Resumo do mês</h2>
        <div className="summary">
          <div className="card"><div className="label">Total do mês</div><div className="value">{formatBRL(monthTotal)}</div></div>
          <div className="card"><div className="label">Dias com recibos</div><div className="value">{days.length}</div></div>
          <div className="card"><div className="label">Dia desconhecido</div><div className="value">{formatBRL(totals.unknownTotal || 0)}</div></div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Recibos por dia</h2>
        {days.map(day => {
          const items = groups.byDay[day] || []
          const dayTotal = (totals.perDay?.[day] || 0)
          const weekday = getWeekdayShort(day)
          return (
            <div key={day} className="day-group">
              <div className="day-header">
                <div className="title">{formatDDMM(day)} ({weekday}): {items.length} recibos</div>
                <div className="value">{formatBRL(dayTotal)}</div>
              </div>
              <ul className="receipt-list">
                {items.map(rec => (
                  <li key={rec.id} className="receipt-item">
                    <div>
                      <div><strong>{typeof rec.value === 'number' ? formatBRL(rec.value) : 'Sem valor'}</strong></div>
                      <div className="receipt-meta">POS {rec.pos || '-'} • DOC {rec.doc || '-'} • NSU {rec.nsu || '-'}</div>
                      {rec.notes ? <div className="receipt-meta">{rec.notes}</div> : null}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="secondary" onClick={() => onEdit?.(rec)}>Editar</button>
                      <button className="secondary" onClick={() => onDelete?.(rec.id)}>Excluir</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        {unknown.length > 0 && (
          <div className="day-group">
            <div className="day-header">
              <div className="title">Dia desconhecido: {unknown.length} recibos</div>
              <div className="value">{formatBRL(totals.unknownTotal || 0)}</div>
            </div>
            <ul className="receipt-list">
              {unknown.map(rec => (
                <li key={rec.id} className="receipt-item">
                  <div>
                    <div><strong>{typeof rec.value === 'number' ? formatBRL(rec.value) : 'Sem valor'}</strong></div>
                    <div className="receipt-meta">POS {rec.pos || '-'} • DOC {rec.doc || '-'} • NSU {rec.nsu || '-'}</div>
                    {rec.notes ? <div className="receipt-meta">{rec.notes}</div> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="secondary" onClick={() => onEdit?.(rec)}>Editar</button>
                    <button className="secondary" onClick={() => onDelete?.(rec.id)}>Excluir</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
