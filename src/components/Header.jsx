/**
 * POS Match Header — mirrors cash-ledger layout: brand | month nav | sync controls
 */
export default function Header({
  logoSrc,
  brandTitle,
  brandSubtitle,
  monthLabel,
  onPrevMonth,
  onNextMonth,
  onAdd,
  onExportCSV,
  onExportJSON,
  syncId,
  syncIdDraft,
  syncStatus,
  onSyncIdChange,
  onConnect,
  onDisconnect,
}) {
  return (
    <header className="app-header">
      <div className="app-header-inner header-grid">
        <div className="brand">
          <img src={logoSrc} alt="Logo" className="brand-logo" />
          <div className="brand-text">
            <div className="brand-title">{brandTitle}</div>
            <div className="brand-subtitle">{brandSubtitle}</div>
          </div>
        </div>

        <MonthNav monthLabel={monthLabel} onPrevMonth={onPrevMonth} onNextMonth={onNextMonth} onAdd={onAdd} onExportCSV={onExportCSV} onExportJSON={onExportJSON} />

        <SyncControls
          syncId={syncId}
          syncIdDraft={syncIdDraft}
          syncStatus={syncStatus}
          onSyncIdChange={onSyncIdChange}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      </div>
    </header>
  )
}

export function MonthNav({ monthLabel, onPrevMonth, onNextMonth, onAdd, onExportCSV, onExportJSON }) {
  return (
    <div className="header-month-controls">
      <div className="month-navigation">
        <button className="month-nav-btn" onClick={onPrevMonth} aria-label="Mês anterior" title="Mês anterior">←</button>
        <span className="current-month">{monthLabel}</span>
        <button className="month-nav-btn" onClick={onNextMonth} aria-label="Próximo mês" title="Próximo mês">→</button>
      </div>
      <div className="month-actions">
        <button className="primary" onClick={onAdd}>Adicionar Recibo</button>
        <button className="secondary" onClick={onExportCSV}>Exportar CSV</button>
        <button className="secondary" onClick={onExportJSON}>Exportar JSON</button>
      </div>
    </div>
  )
}

export function SyncControls({
  syncId,
  syncIdDraft,
  syncStatus,
  onSyncIdChange,
  onConnect,
  onDisconnect,
}) {
  const btn = getSyncButtonPresentation({ syncId, syncStatus, syncIdDraft, onConnect, onDisconnect })
  return (
    <div className="sync-group">
      <div className="sync-id-row">
        <input
          id="sync-id"
          className="cell-input sync-input"
          placeholder="Sync ID"
          aria-label="Sync ID"
          value={syncIdDraft}
          onChange={event => onSyncIdChange(event.target.value.trim())}
        />
        <div className="sync-actions-inline">
          <button
            className={`sync-btn ${btn.variant}`}
            onClick={btn.onClick}
            disabled={btn.disabled}
            aria-label={btn.aria}
            title={btn.title}
          >
            <span className="sync-icon" aria-hidden>
              {btn.icon}
            </span>
            <span>{btn.label}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function getSyncButtonPresentation({ syncId, syncStatus, syncIdDraft, onConnect, onDisconnect }) {
  if (!syncId) {
    return { variant: 'sync-btn--off', label: 'Conectar', icon: '○', onClick: onConnect, disabled: !syncIdDraft, aria: 'Conectar sync', title: 'Conectar' }
  }
  if (syncStatus === 'loading') {
    return { variant: 'sync-btn--loading', label: 'Conectando…', icon: '⟳', onClick: () => {}, disabled: true, aria: 'Sincronizando', title: 'Sincronizando' }
  }
  if (syncStatus === 'ok') {
    return { variant: 'sync-btn--ok', label: 'Desconectar', icon: '✓', onClick: onDisconnect, disabled: false, aria: 'Desconectar sync', title: 'Desconectar' }
  }
  return { variant: 'sync-btn--error', label: 'Tentar novamente', icon: '⚠', onClick: onConnect, disabled: false, aria: 'Tentar novamente', title: 'Tentar novamente' }
}
