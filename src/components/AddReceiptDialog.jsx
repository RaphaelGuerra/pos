import { useEffect, useMemo, useRef, useState } from 'react'
import Tesseract from 'tesseract.js'
import { parseCieloReceipt } from '../lib/cieloParser'

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
  const [ocrDebug, setOcrDebug] = useState(null)
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
  }, [open, month, mode, receipt, date])

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    return undefined
  }, [file])

  // OCR helpers
  async function loadImageBitmap(blob) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob)
    }
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        resolve(img)
        URL.revokeObjectURL(img.src)
      }
      img.onerror = (err) => {
        reject(err)
        URL.revokeObjectURL(img.src)
      }
      img.src = URL.createObjectURL(blob)
    })
  }

  async function preprocessImage(blob) {
    const bitmap = await loadImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0)
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { data } = imageData
    const totalPixels = canvas.width * canvas.height
    if (!totalPixels) return canvas

    const grays = new Float32Array(totalPixels)
    let min = 255
    let max = 0
    let sum = 0
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      grays[p] = gray
      if (gray < min) min = gray
      if (gray > max) max = gray
      sum += gray
    }
    const diff = max - min || 1
    const mean = sum / totalPixels
    const thresholdNorm = Math.min(0.85, Math.max(0.35, (mean - min) / diff))

    for (let p = 0; p < totalPixels; p += 1) {
      const normalized = (grays[p] - min) / diff
      const value = normalized > thresholdNorm ? 255 : 0
      const idx = p * 4
      data[idx] = value
      data[idx + 1] = value
      data[idx + 2] = value
      data[idx + 3] = 255
    }
    ctx.putImageData(imageData, 0, 0)
    return canvas
  }

  async function runOCR(imgBlob) {
    if (!imgBlob) return
    setOcrStatus('running')
    setOcrHint('Lendo texto…')
    setOcrDebug(null)
    try {
      const controller = new AbortController()
      ocrCancelRef.current = () => controller.abort()
      let ocrInput = imgBlob
      let usedPreprocessing = false
      try {
        const preprocessed = await preprocessImage(imgBlob)
        if (preprocessed) {
          ocrInput = preprocessed
          usedPreprocessing = true
        }
      } catch (err) {
        usedPreprocessing = false
      }
      const { data } = await Tesseract.recognize(ocrInput, 'por', { logger: () => {} })
      const rawText = (data?.text || '').replace(/\u00A0/g, ' ')
      const { normalizedText, result: parsed } = parseCieloReceipt(rawText)

      const hints = []
      if (!valueUnreadable && !value && parsed.raw_amount) {
        setValue(parsed.raw_amount)
        if (parsed.amount_brl != null) hints.push(`Valor detectado R$ ${parsed.amount_brl.toFixed(2)}`)
      }
      if (!dateUnreadable && !date && parsed.datetime_local) {
        const isoDate = parsed.datetime_local.slice(0, 10)
        setDate(isoDate)
        hints.push(`Data detectada ${isoDate}`)
      }
      if (!pos && parsed.pos_id) setPos(`POS-${parsed.pos_id}`)
      if (!doc && parsed.doc) setDoc(parsed.doc)
      if (!nsu && parsed.auth) setNsu(parsed.auth)

      setOcrHint(hints.join(' • '))
      setOcrStatus('done')
      setOcrDebug({
        rawText,
        normalizedText,
        parsed,
        usedPreprocessing,
      })
    } catch (e) {
      setOcrStatus('error')
      setOcrHint('Falha ao ler OCR')
      setOcrDebug({ error: true, message: e?.message || String(e) })
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
    setOcrStatus('idle'); setOcrHint(''); setOcrDebug(null)
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
            {ocrDebug ? (
              <div className="ocr-debug">
                {'error' in ocrDebug ? (
                  <div className="hint" style={{ color: 'var(--danger)' }}>Falha na leitura OCR: {ocrDebug.message}</div>
                ) : (
                  <>
                    <div className="hint" style={{ fontWeight: 600 }}>Pré-visualização dos dados OCR</div>
                    <div className="hint">Valor identificado: {(() => {
                      const amount = ocrDebug.parsed?.amount_brl
                      return amount != null ? `R$ ${amount.toFixed(2)}` : 'nenhum'
                    })()}</div>
                    <div className="hint">Data identificada: {(() => {
                      const dt = ocrDebug.parsed?.datetime_local
                      return dt ? dt.slice(0, 10) : 'nenhuma'
                    })()}</div>
                    <div className="hint">Pré-processamento: {ocrDebug.usedPreprocessing ? 'ativado' : 'não aplicado'}</div>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Texto normalizado ({ocrDebug.normalizedText.length} caracteres)</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: 'var(--surface-2)', padding: 8, borderRadius: 6 }}>{ocrDebug.normalizedText}</pre>
                    </details>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>JSON extraído</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: 'var(--surface-2)', padding: 8, borderRadius: 6 }}>{JSON.stringify(ocrDebug.parsed ?? {}, null, 2)}</pre>
                    </details>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Texto bruto ({ocrDebug.rawText.length} caracteres)</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: 'var(--surface-2)', padding: 8, borderRadius: 6 }}>{ocrDebug.rawText}</pre>
                    </details>
                  </>
                )}
              </div>
            ) : null}
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
