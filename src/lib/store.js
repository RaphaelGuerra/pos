import { encryptJSON, decryptJSON, isEncryptedEnvelope } from './crypto.js'

const PREFIX = 'posmatch.v1.data.'
const SYNC_ID_KEY = 'posmatch.v1.syncId'

function debounce(fn, ms) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}

export function getSyncId() { try { return localStorage.getItem(SYNC_ID_KEY) || '' } catch { return '' } }
export function setSyncId(id) { try { if (id) localStorage.setItem(SYNC_ID_KEY, id); else localStorage.removeItem(SYNC_ID_KEY) } catch {} }

export function monthKey(month) { return `${PREFIX}${month}` }

export function loadLocal(month) {
  try {
    const raw = localStorage.getItem(monthKey(month))
    return raw ? JSON.parse(raw) : { receipts: [] }
  } catch { return { receipts: [] } }
}

export const saveLocalDebounced = debounce((month, data) => {
  try { localStorage.setItem(monthKey(month), JSON.stringify(data)) } catch {}
}, 300)

export async function loadRemote(syncId, month) {
  try {
    const res = await fetch(`/api/storage/${encodeURIComponent(syncId)}/${encodeURIComponent(month)}`)
    if (!res.ok) return { ok: false, data: null }
    const data = await res.json()
    if (data === null) return { ok: true, data: null }
    if (!isEncryptedEnvelope(data)) return { ok: false, data: null }
    try {
      const plain = await decryptJSON(data, syncId)
      return { ok: true, data: plain }
    } catch { return { ok: false, data: null } }
  } catch { return { ok: false, data: null } }
}

export const saveRemoteDebounced = debounce(async (syncId, month, data, onDone) => {
  try {
    let body
    try { body = JSON.stringify(await encryptJSON(data, syncId)) }
    catch { if (typeof onDone === 'function') onDone(false); return }
    const res = await fetch(`/api/storage/${encodeURIComponent(syncId)}/${encodeURIComponent(month)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
    })
    if (typeof onDone === 'function') onDone(res.ok)
  } catch { if (typeof onDone === 'function') onDone(false) }
}, 500)
