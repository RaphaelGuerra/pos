import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import DailyFlagsPanel from './components/DailyFlagsPanel.jsx'
import AddReceiptDialog from './components/AddReceiptDialog.jsx'
import ReceiptMonthView from './components/ReceiptMonthView.jsx'
import { getMonthDisplayName, incMonth } from './lib/date.js'
import { loadLocal, saveLocalDebounced, getSyncId, setSyncId, loadRemote, saveRemoteDebounced } from './lib/store.js'
import { groupByDay, totals as computeTotals, countPending } from './lib/selectors.js'
import { downloadCSV, downloadJSON } from './lib/exports.js'

export default function App() {
  const now = new Date()
  const firstDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10)
  const [activeMonth, setActiveMonth] = useState(firstDay.slice(0, 7))
  const [receipts, setReceipts] = useState([])
  const [syncId, setSyncIdState] = useState('')
  const [syncIdDraft, setSyncIdDraft] = useState('')
  const [syncStatus, setSyncStatus] = useState('off') // off | loading | ok | error
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editorMode, setEditorMode] = useState('create') // 'create' | 'edit'
  const [editingReceipt, setEditingReceipt] = useState(null)
  const [toast, setToast] = useState('')
  const lastSyncStatusRef = useRef('off')

  // Initialize Sync ID from local storage
  useEffect(() => {
    const id = getSyncId()
    setSyncIdState(id)
    setSyncIdDraft(id)
  }, [])

  // Load month data (remote first if connected)
  useEffect(() => {
    let cancelled = false
    setReceipts([])
    async function load() {
      let data = null
      if (syncId) {
        setSyncStatus('loading')
        const res = await loadRemote(syncId, activeMonth)
        if (res.ok) {
          setSyncStatus('ok')
          lastSyncStatusRef.current = 'ok'
          data = res.data
          if (!cancelled) showToast('Sync conectado')
        } else {
          setSyncStatus('error')
          lastSyncStatusRef.current = 'error'
          if (!cancelled) showToast('Falha de sync')
        }
      }
      if (!data) data = loadLocal(activeMonth)
      if (cancelled) return
      setReceipts(data?.receipts || [])
    }
    load()
    return () => { cancelled = true }
  }, [activeMonth, syncId])

  function persist(next) {
    saveLocalDebounced(activeMonth, { receipts: next })
    if (syncId) saveRemoteDebounced(syncId, activeMonth, { receipts: next }, ok => {
      setSyncStatus(ok ? 'ok' : 'error')
      if (!ok) { lastSyncStatusRef.current = 'error'; showToast('Falha de sync') }
      else { if (lastSyncStatusRef.current !== 'ok') showToast('Sync atualizado'); lastSyncStatusRef.current = 'ok' }
    })
  }

  const groups = useMemo(() => groupByDay(receipts, activeMonth), [receipts, activeMonth])
  const totals = useMemo(() => computeTotals(receipts, activeMonth), [receipts, activeMonth])
  const pending = useMemo(() => receipts.filter(r => (!r?.value || !r?.date) && ((r?.date || '').startsWith(activeMonth) || !r?.date)).length, [receipts, activeMonth])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 1800)
  }

  function handleAdd(rec) {
    const next = [rec, ...receipts]
    setReceipts(next)
    persist(next)
    setDialogOpen(false)
    showToast('Recibo adicionado')
  }

  function handleUpdate(rec) {
    const next = receipts.map(r => (r.id === rec.id ? { ...r, ...rec } : r))
    setReceipts(next)
    persist(next)
    setDialogOpen(false)
    setEditingReceipt(null)
    setEditorMode('create')
    showToast('Recibo atualizado')
  }

  function handleDelete(id) {
    const next = receipts.filter(r => r.id !== id)
    setReceipts(next)
    persist(next)
    showToast('Recibo removido')
  }

  function exportCSV() {
    const monthReceipts = receipts.filter(r => (r?.date || '').startsWith(activeMonth))
    downloadCSV(`posmatch-${activeMonth}.csv`, monthReceipts)
  }
  function exportJSON() {
    const monthReceipts = receipts.filter(r => (r?.date || '').startsWith(activeMonth) || !(r?.date))
    downloadJSON(`posmatch-${activeMonth}.json`, monthReceipts)
  }

  function handleSyncIdChange(id) { setSyncIdDraft(id) }
  function connectSync() {
    const id = (syncIdDraft || '').trim()
    setSyncIdState(id)
    setSyncId(id)
    setSyncStatus(id ? 'loading' : 'off')
    lastSyncStatusRef.current = id ? 'loading' : 'off'
  }
  function disconnectSync() {
    setSyncIdState('')
    setSyncId('')
    setSyncStatus('off')
    showToast('Sync desconectado')
    lastSyncStatusRef.current = 'off'
  }

  return (
    <div className="app-root">
      <Header
        logoSrc={'/logo.webp'}
        brandTitle={'Vison Hotel'}
        brandSubtitle={'Bater Cartão — Recibos'}
        monthLabel={getMonthDisplayName(activeMonth)}
        onPrevMonth={() => setActiveMonth(prev => incMonth(prev, -1))}
        onNextMonth={() => setActiveMonth(prev => incMonth(prev, 1))}
        onAdd={() => { setEditorMode('create'); setEditingReceipt(null); setDialogOpen(true) }}
        onExportCSV={exportCSV}
        onExportJSON={exportJSON}
        syncId={syncId}
        syncIdDraft={syncIdDraft}
        syncStatus={syncStatus}
        onSyncIdChange={handleSyncIdChange}
        onConnect={connectSync}
        onDisconnect={disconnectSync}
      />

      <section className="section">
        <div className="summary">
          <div className="card"><div className="label">Recibos no mês</div><div className="value">{receipts.filter(r => (r?.date || '').startsWith(activeMonth)).length}</div></div>
          <div className="card"><div className="label">Pendentes (valor/data)</div><div className="value">{pending}</div></div>
          <div className="card"><div className="label">Totais</div><div className="value">R$ {(totals.monthTotal || 0).toFixed(2)}</div></div>
        </div>
      </section>

      <DailyFlagsPanel month={activeMonth} receipts={receipts} />

      <ReceiptMonthView month={activeMonth} groups={groups} totals={totals} onDelete={handleDelete} onEdit={(rec) => { setEditorMode('edit'); setEditingReceipt(rec); setDialogOpen(true) }} />

      <AddReceiptDialog open={dialogOpen} month={activeMonth} mode={editorMode} receipt={editingReceipt} onClose={() => { setDialogOpen(false); setEditingReceipt(null); setEditorMode('create') }} onSave={handleAdd} onUpdate={handleUpdate} />

      {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
    </div>
  )
}
