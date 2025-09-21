import { useEffect, useMemo, useState } from 'react'

function parseCurrencyBRL(input) {
  if (input == null || input === '') return null
  const s = String(input).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export default function AddReceiptDialog({ open, month, onClose, onSave }) {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const [value, setValue] = useState('')
  const [valueUnreadable, setValueUnreadable] = useState(false)
  const [date, setDate] = useState('')
  const [dateUnreadable, setDateUnreadable] = useState(false)
  const [pos, setPos] = useState('')
  const [doc, setDoc] = useState('')
  const [nsu, setNsu] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return undefined
    // Default date to first day of selected month for convenience
    if (!date && month) setDate(`${month}-01`)
  }, [open, month])

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    return undefined
  }, [file])

  const completeness = useMemo(() => {
    const vOk = valueUnreadable || parseCurrencyBRL(value) != null
    const dOk = dateUnreadable || !!date
    const c = (vOk ? 1 : 0) + (dOk ? 1 : 0)
    return `${c}/2`
  }, [valueUnreadable, value, dateUnreadable, date])

  function reset() {
    setFile(null); setPreviewUrl(''); setValue(''); setValueUnreadable(false); setDate(''); setDateUnreadable(false); setPos(''); setDoc(''); setNsu(''); setNotes('')
  }

  function buildReceipt(draft = false) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const valNum = valueUnreadable ? null : parseCurrencyBRL(value)
    const hasDate = dateUnreadable ? null : (date || null)
    return {
      id,
      date: hasDate,
      value: valNum,
      pos: pos || null,
      doc: doc || null,
      nsu: nsu || null,
      source: file?.name || null,
      notes: notes || null,
      origin: {
        value: valueUnreadable ? 'unreadable' : (value ? 'manual' : null),
        date: dateUnreadable ? 'unreadable' : (date ? 'manual' : null),
      },
      draft: !!draft,
    }
  }

  function handleSave(place = true) {
    const rec = buildReceipt(false)
    onSave(rec)
    reset()
  }

  function handleSaveDraft() {
    const rec = buildReceipt(true)
    onSave(rec)
    reset()
  }

  if (!open) return null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header>
          <div>
            <strong>Confirmar dados do recibo</strong>
            <div className="hint">Completude: {completeness} (Valor e Data)</div>
          </div>
          <button className="secondary" onClick={() => { reset(); onClose() }}>Fechar</button>
        </header>
        <div className="content">
          <div className="field full">
            <label>Foto do recibo</label>
            <div className="row">
              <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
              {previewUrl ? <img src={previewUrl} alt="Prévia" style={{ maxHeight: 80, borderRadius: 6, border: '1px solid var(--border)' }} /> : null}
            </div>
            <div className="hint">Você pode tirar foto ou escolher da galeria</div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Valor (R$)</label>
              <div className="row">
                <input className="cell-input" inputMode="decimal" placeholder="0,00" value={value} onChange={e => setValue(e.target.value)} disabled={valueUnreadable} />
                <label className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={valueUnreadable} onChange={e => setValueUnreadable(e.target.checked)} />
                  Ilegível
                </label>
              </div>
            </div>

            <div className="field">
              <label>Data</label>
              <div className="row">
                <input className="cell-input" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={dateUnreadable} />
                <label className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={dateUnreadable} onChange={e => setDateUnreadable(e.target.checked)} />
                  Ilegível
                </label>
              </div>
              <div className="hint">Se não definida, irá para "Dia desconhecido"</div>
            </div>

            <div className="field">
              <label>POS / Terminal</label>
              <input className="cell-input" value={pos} onChange={e => setPos(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="field">
              <label>DOC</label>
              <input className="cell-input" value={doc} onChange={e => setDoc(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="field">
              <label>NSU</label>
              <input className="cell-input" value={nsu} onChange={e => setNsu(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="field full">
              <label>Notas</label>
              <input className="cell-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
        </div>
        <div className="footer">
          <button className="secondary" onClick={handleSaveDraft}>Salvar como Rascunho</button>
          <button className="primary" onClick={handleSave}>Salvar e Organizar</button>
        </div>
      </div>
    </div>
  )
}
