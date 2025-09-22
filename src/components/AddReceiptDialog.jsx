import { useEffect, useMemo, useRef, useState } from 'react'
import Tesseract from 'tesseract.js'
import { parseCieloReceipt, postProcessCieloRois } from '../lib/cieloParser'

function parseCurrencyBRL(input) {
  if (input == null || input === '') return null
  const s = String(input).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const ROI_CONFIG = [
  { id: 'ROI_A', label: 'brand_mode', rect: { x: 0.34, y: 0.13, w: 0.32, h: 0.05 }, psm: 7, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇÃÉÍÓÚÂÊÔÀ- ' },
  { id: 'ROI_B', label: 'masked_pan', rect: { x: 0.3, y: 0.18, w: 0.4, h: 0.04 }, psm: 7, whitelist: '*0123456789 ' },
  { id: 'ROI_C', label: 'via_pos', rect: { x: 0.18, y: 0.23, w: 0.64, h: 0.05 }, psm: 6, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/ ' },
  { id: 'ROI_D', label: 'cnpj_digits', rect: { x: 0.28, y: 0.32, w: 0.3, h: 0.04 }, psm: 7, whitelist: '0123456789' },
  { id: 'ROI_E', label: 'merchant_name', rect: { x: 0.18, y: 0.38, w: 0.64, h: 0.06 }, psm: 6, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/ ' },
  { id: 'ROI_F', label: 'address_cityUF', rect: { x: 0.18, y: 0.45, w: 0.64, h: 0.1 }, psm: 6, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/º° ' },
  { id: 'ROI_G', label: 'doc_aut_line', rect: { x: 0.18, y: 0.55, w: 0.64, h: 0.05 }, psm: 7, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ' },
  { id: 'ROI_H', label: 'date_time_chan', rect: { x: 0.18, y: 0.63, w: 0.64, h: 0.06 }, psm: 7, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/: ' },
  { id: 'ROI_I', label: 'amount', rect: { x: 0.6, y: 0.78, w: 0.28, h: 0.06 }, psm: 7, whitelist: '0123456789.,' },
]

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function cropCanvas(source, rect) {
  const { width, height } = source
  const sx = Math.max(0, Math.min(width - 1, Math.round(width * rect.x)))
  const sy = Math.max(0, Math.min(height - 1, Math.round(height * rect.y)))
  const sw = Math.max(1, Math.min(width - sx, Math.round(width * rect.w)))
  const sh = Math.max(1, Math.min(height - sy, Math.round(height * rect.h)))
  const canvas = createCanvas(sw, sh)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvas
}

function clahe(grays, width, height, clipLimit = 2.0, tiles = 8) {
  const histSize = 256
  const tilesX = Math.max(1, tiles)
  const tilesY = Math.max(1, tiles)
  const tileWidth = Math.ceil(width / tilesX)
  const tileHeight = Math.ceil(height / tilesY)
  const maps = new Array(tilesX * tilesY)

  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const x0 = tx * tileWidth
      const y0 = ty * tileHeight
      const x1 = Math.min(width, x0 + tileWidth)
      const y1 = Math.min(height, y0 + tileHeight)
      const hist = new Float32Array(histSize)
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const idx = y * width + x
          const v = Math.max(0, Math.min(255, Math.round(grays[idx])))
          hist[v] += 1
        }
      }
      const tilePixels = (x1 - x0) * (y1 - y0) || 1
      const clipThreshold = (clipLimit * tilePixels) / histSize
      let excess = 0
      for (let i = 0; i < histSize; i += 1) {
        if (hist[i] > clipThreshold) {
          excess += hist[i] - clipThreshold
          hist[i] = clipThreshold
        }
      }
      const increment = excess / histSize
      let cdf = 0
      const lut = new Uint8Array(histSize)
      for (let i = 0; i < histSize; i += 1) {
        hist[i] += increment
        cdf += hist[i]
        lut[i] = Math.max(0, Math.min(255, Math.round((cdf * 255) / tilePixels)))
      }
      maps[ty * tilesX + tx] = lut
    }
  }

  const output = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const ty = Math.min(tilesY - 1, Math.floor(y / tileHeight))
    const ty1 = Math.min(tilesY - 1, ty + 1)
    const fy = tileHeight > 1 ? (y - ty * tileHeight) / tileHeight : 0
    for (let x = 0; x < width; x += 1) {
      const tx = Math.min(tilesX - 1, Math.floor(x / tileWidth))
      const tx1 = Math.min(tilesX - 1, tx + 1)
      const fx = tileWidth > 1 ? (x - tx * tileWidth) / tileWidth : 0
      const idx = y * width + x
      const g = Math.max(0, Math.min(255, Math.round(grays[idx])))
      const lut00 = maps[ty * tilesX + tx]
      const lut10 = maps[ty * tilesX + tx1]
      const lut01 = maps[ty1 * tilesX + tx]
      const lut11 = maps[ty1 * tilesX + tx1]
      const w00 = (1 - fx) * (1 - fy)
      const w10 = fx * (1 - fy)
      const w01 = (1 - fx) * fy
      const w11 = fx * fy
      output[idx] = w00 * lut00[g] + w10 * lut10[g] + w01 * lut01[g] + w11 * lut11[g]
    }
  }
  return output
}

function buildIntegralImage(grays, width, height) {
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0
    for (let x = 1; x <= width; x += 1) {
      const idx = (y - 1) * width + (x - 1)
      rowSum += grays[idx]
      integral[y * (width + 1) + x] = rowSum + integral[(y - 1) * (width + 1) + x]
    }
  }
  return integral
}

function boxSum(integral, width, x0, y0, x1, y1) {
  const stride = width + 1
  return (
    integral[y1 * stride + x1] -
    integral[y0 * stride + x1] -
    integral[y1 * stride + x0] +
    integral[y0 * stride + x0]
  )
}

function adaptiveThreshold(grays, width, height, blockSize = 31, C = 15) {
  const half = Math.max(1, Math.floor(blockSize / 2))
  const integral = buildIntegralImage(grays, width, height)
  const binary = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(height - 1, y + half)
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(width - 1, x + half)
      const sum = boxSum(integral, width, x0, y0, x1 + 1, y1 + 1)
      const count = (x1 - x0 + 1) * (y1 - y0 + 1) || 1
      const mean = sum / count
      const idx = y * width + x
      binary[idx] = grays[idx] > mean - C ? 255 : 0
    }
  }
  return binary
}

function morphologyOpenHorizontal(binary, width, height) {
  const eroded = new Uint8ClampedArray(binary.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      const current = binary[idx] === 255
      const right = x + 1 < width ? binary[idx + 1] === 255 : false
      eroded[idx] = current && right ? 255 : 0
    }
  }
  const dilated = new Uint8ClampedArray(binary.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      const current = eroded[idx] === 255
      const left = x > 0 ? eroded[idx - 1] === 255 : false
      dilated[idx] = current || left ? 255 : 0
    }
  }
  return dilated
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
    const borderX = bitmap.width * 0.025
    const borderY = bitmap.height * 0.025
    const cropWidth = Math.max(1, bitmap.width - borderX * 2)
    const cropHeight = Math.max(1, bitmap.height - borderY * 2)
    const cropped = createCanvas(cropWidth, cropHeight)
    const cropCtx = cropped.getContext('2d', { willReadFrequently: true })
    cropCtx.drawImage(bitmap, borderX, borderY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

    const scale = 1.6
    const scaled = createCanvas(cropWidth * scale, cropHeight * scale)
    const scaledCtx = scaled.getContext('2d', { willReadFrequently: true })
    scaledCtx.imageSmoothingEnabled = true
    scaledCtx.drawImage(cropped, 0, 0, scaled.width, scaled.height)

    const imageData = scaledCtx.getImageData(0, 0, scaled.width, scaled.height)
    const { data } = imageData
    const totalPixels = scaled.width * scaled.height
    if (!totalPixels) return scaled

    const grays = new Float32Array(totalPixels)
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      grays[p] = gray
    }

    const enhanced = clahe(grays, scaled.width, scaled.height, 2.0, 8)
    const binary = morphologyOpenHorizontal(
      adaptiveThreshold(enhanced, scaled.width, scaled.height, 31, 15),
      scaled.width,
      scaled.height,
    )

    for (let p = 0; p < totalPixels; p += 1) {
      const value = binary[p]
      const idx = p * 4
      data[idx] = value
      data[idx + 1] = value
      data[idx + 2] = value
      data[idx + 3] = 255
    }
    scaledCtx.putImageData(imageData, 0, 0)
    return scaled
  }

  async function runOCR(imgBlob) {
    if (!imgBlob) return
    setOcrStatus('running')
    setOcrHint('Lendo texto…')
    setOcrDebug(null)
    try {
      const controller = new AbortController()
      ocrCancelRef.current = () => controller.abort()
      let processed = null
      let usedPreprocessing = false
      try {
        processed = await preprocessImage(imgBlob)
        usedPreprocessing = !!processed
      } catch (err) {
        usedPreprocessing = false
      }

      const ocrTarget = processed || imgBlob
      const anchorOcr = await Tesseract.recognize(ocrTarget, 'por', {
        logger: () => {},
        tessedit_pageseg_mode: 6,
      })
      const rawText = (anchorOcr?.data?.text || '').replace(/\u00A0/g, ' ')
      const fallback = parseCieloReceipt(rawText)

      let roiPayload = null
      if (processed) {
        const roiTexts = {}
        for (const spec of ROI_CONFIG) {
          const roiCanvas = cropCanvas(processed, spec.rect)
          const options = {
            logger: () => {},
            tessedit_pageseg_mode: spec.psm,
          }
          if (spec.whitelist) options.tessedit_char_whitelist = spec.whitelist
          const roiResult = await Tesseract.recognize(roiCanvas, 'por', options)
          roiTexts[spec.id] = (roiResult?.data?.text || '').replace(/\u00A0/g, ' ')
        }
        roiPayload = postProcessCieloRois(roiTexts)
      }

      const parsed = roiPayload
        ? { ...roiPayload.result, merchant: { ...roiPayload.result.merchant } }
        : { ...fallback.result, merchant: { ...fallback.result.merchant } }

      if (roiPayload) {
        const fallbackResult = fallback.result
        const simpleKeys = [
          'issuer',
          'brand',
          'mode',
          'card_last4',
          'masked_pan',
          'via',
          'pos_id',
          'doc',
          'auth',
          'datetime_local',
          'channel',
          'operation',
          'amount_brl',
          'raw_amount',
        ]
        simpleKeys.forEach((key) => {
          if ((parsed[key] == null || parsed[key] === '') && fallbackResult[key] != null) {
            parsed[key] = fallbackResult[key]
          }
        })
        const merchantKeys = ['cnpj', 'name', 'address', 'city', 'state']
        merchantKeys.forEach((key) => {
          if ((parsed.merchant[key] == null || parsed.merchant[key] === '') && fallbackResult.merchant[key] != null) {
            parsed.merchant[key] = fallbackResult.merchant[key]
          }
        })
        const needs = new Set()
        if (!parsed.brand) needs.add('brand')
        if (!parsed.mode) needs.add('mode')
        if (!parsed.masked_pan) needs.add('masked_pan')
        if (!parsed.card_last4) needs.add('card_last4')
        if (!parsed.via) needs.add('via')
        if (!parsed.pos_id) needs.add('pos_id')
        if (!parsed.merchant.cnpj) needs.add('merchant.cnpj')
        if (!parsed.merchant.name) needs.add('merchant.name')
        if (!parsed.merchant.address) needs.add('merchant.address')
        if (!parsed.merchant.city) needs.add('merchant.city')
        if (!parsed.merchant.state) needs.add('merchant.state')
        if (!parsed.doc) needs.add('doc')
        if (!parsed.auth) needs.add('auth')
        if (!parsed.datetime_local) needs.add('datetime_local')
        if (!parsed.channel) needs.add('channel')
        if (parsed.amount_brl == null) needs.add('amount_brl')
        if (!parsed.raw_amount) needs.add('raw_amount')
        parsed.needs_user_input = Array.from(needs)
      }

      const normalizedText = fallback.normalizedText

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
        roiTexts: roiPayload?.rois || null,
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
