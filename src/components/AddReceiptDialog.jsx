import { useEffect, useMemo, useRef, useState } from 'react'
import Tesseract from 'tesseract.js'

function parseCurrencyBRL(input) {
  if (input == null || input === '') return null
  const s = String(input).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export default function AddReceiptDialog({ open, month, mode = 'create', receipt = null, onClose, onSave, onUpdate }) {
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
  const [ocrStatus, setOcrStatus] = useState('idle') // idle | running | done | error
  const [ocrHint, setOcrHint] = useState('')
  const ocrCancelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    if (mode === 'edit' && receipt) {
      setFile(null); setPreviewUrl('')
      setValue(receipt.value != null ? String(receipt.value).replace('.', ',') : '')
      setDate(receipt.date || '')
      setPos(receipt.pos || '')
      setDoc(receipt.doc || '')
      setNsu(receipt.nsu || '')
      setNotes(receipt.notes || '')
      setValueUnreadable(receipt.value == null)
      setDateUnreadable(!receipt.date)
    } else {
      // Default date to first day of selected month for convenience
      if (!date && month) setDate(`${month}-01`)
    }
  }, [open, month, mode, receipt])

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    return undefined
  }, [file])

  // OCR helpers
  function extractNumbersBR(text) {
    const results = []
    const re = /(R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/g
    let m
    while ((m = re.exec(text)) !== null) {
      const raw = m[0]
      const val = parseCurrencyBRL(raw)
      if (val != null) results.push({ raw, val })
    }
    return results
  }
  function extractDateBR(text) {
    const re = /(\b)(\d{2})\/(\d{2})\/(\d{2,4})(\b)/g
    let m
    const found = []
    while ((m = re.exec(text)) !== null) {
      let [_, __, dd, mm, yy] = m
      if (yy.length === 2) yy = String(2000 + Number(yy))
      const iso = `${yy}-${mm}-${dd}`
      found.push({ dd, mm, yy, iso })
    }
    return found
  }

  async function runOCR(imgBlob) {
    if (!imgBlob) return
    setOcrStatus('running')
    setOcrHint('Lendo texto…')
    try {
      const controller = new AbortController()
      ocrCancelRef.current = () => controller.abort()
      const { data } = await Tesseract.recognize(imgBlob, 'por', { logger: () => {} })
      const text = (data?.text || '').replace(/\u00A0/g, ' ')
      // value candidates
      const nums = extractNumbersBR(text)
      // heuristic: prefer numbers near keywords
      const lines = text.split(/\r?\n/).map(s => s.toLowerCase())
      const keyIdx = lines.findIndex(l => /(total|valor|pago|pagamento)/.test(l))
      let pickedValue = null
      if (keyIdx >= 0) {
        const around = lines.slice(Math.max(0, keyIdx - 1), keyIdx + 2).join(' ')
        const near = extractNumbersBR(around).map(n => n.val)
        if (near.length) pickedValue = Math.max(...near)
      }
      if (pickedValue == null && nums.length) pickedValue = Math.max(...nums.map(n => n.val))

      // date candidates
      const dates = extractDateBR(text)
      let pickedDate = null
      if (dates.length) {
        // prefer dates within +/- 2 months from selected month
        const monthRef = month
        const candidates = dates.map(d => d.iso)
        pickedDate = candidates[0]
        const near = candidates.find(d => (d || '').slice(0, 7) === (monthRef || ''))
        if (near) pickedDate = near
      }

      // Fill only if user hasn't typed/locked field
      let hints = []
      if (!valueUnreadable && !value && pickedValue != null) {
        setValue(String(pickedValue).replace('.', ','))
        hints.push(`Valor detectado R$ ${pickedValue.toFixed(2)}`)
      }
      if (!dateUnreadable && !date && pickedDate) {
        setDate(pickedDate)
        hints.push(`Data detectada ${pickedDate}`)
      }
      setOcrHint(hints.join(' • '))
      setOcrStatus('done')
    } catch (e) {
      setOcrStatus('error')
      setOcrHint('Falha ao ler OCR')
    } finally {
      ocrCancelRef.current = null
    }
  }

  const completeness = useMemo(() => {
    const vOk = valueUnreadable || parseCurrencyBRL(value) != null
    const dOk = dateUnreadable || !!date
    const c = (vOk ? 1 : 0) + (dOk ? 1 : 0)
    return `${c}/2`
  }, [valueUnreadable, value, dateUnreadable, date])

  function reset() {
    setFile(null); setPreviewUrl(''); setValue(''); setValueUnreadable(false); setDate(''); setDateUnreadable(false); setPos(''); setDoc(''); setNsu(''); setNotes('')
    setOcrStatus('idle'); setOcrHint('')
  }

  function buildReceipt(draft = false) {
    const id = mode === 'edit' && receipt?.id ? receipt.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const valNum = valueUnreadable ? null : parseCurrencyBRL(value)
    const hasDate = dateUnreadable ? null : (date || null)
    return {
      id,
      date: hasDate,
      value: valNum,
      pos: pos || null,
      doc: doc || null,
      nsu: nsu || null,
      source: file?.name || receipt?.source || null,
      notes: notes || null,
      origin: {
        value: valueUnreadable ? 'unreadable' : (value ? 'manual' : null),
        date: dateUnreadable ? 'unreadable' : (date ? 'manual' : null),
      },
      draft: !!draft,
    }
  }

  function handleSave() {
    const rec = buildReceipt(false)
    if (mode === 'edit' && typeof onUpdate === 'function') onUpdate(rec)
    else onSave(rec)
    reset()
  }

  function handleSaveDraft() {
    const rec = buildReceipt(true)
    if (mode === 'edit' && typeof onUpdate === 'function') onUpdate(rec)
    else onSave(rec)
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
            {ocrStatus !== 'idle' ? <div className="hint">OCR: {ocrStatus}{ocrHint ? ` — ${ocrHint}` : ''}</div> : null}
          </div>
          <button className="secondary" onClick={() => { reset(); onClose() }}>Fechar</button>
        </header>
        <div className="content">
          <div className="field full">
            <label>Foto do recibo</label>
            <div className="row">
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f) runOCR(f) }} />
              {previewUrl ? <img src={previewUrl} alt="Prévia" style={{ maxHeight: 80, borderRadius: 6, border: '1px solid var(--border)' }} /> : null}
              {file ? <button className="secondary" type="button" onClick={() => runOCR(file)} disabled={ocrStatus==='running'}>{ocrStatus==='running' ? 'Lendo…' : 'Reprocessar OCR'}</button> : null}
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
          <button className="primary" onClick={handleSave}>{mode === 'edit' ? 'Atualizar' : 'Salvar e Organizar'}</button>
        </div>
      </div>
    </div>
  )
}
