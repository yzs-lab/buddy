import { Download, RefreshCw, X } from 'lucide-react'
import { useUpdater } from '../hooks/useUpdater'
import { useT } from '../hooks/useI18n'

export function UpdateNotification() {
  const { status, version, progress, mandatory, errorMessage, checkForUpdates, installUpdate } = useUpdater()
  const t = useT()

  if (status === 'idle' || status === 'checking') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-bg-elevated border border-border rounded-xl shadow-lg overflow-hidden">
      {status === 'available' && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-accent-primary">
              {t('updater.available', { version })}
            </span>
            {!mandatory && (
              <button onClick={() => {}} className="text-fg-muted hover:text-fg">
                <X size={14} />
              </button>
            )}
          </div>
          <p className="text-xs text-fg-secondary mb-3">
            {mandatory ? t('updater.mandatoryHint') : t('updater.downloadHint')}
          </p>
          <button
            onClick={() => checkForUpdates()}
            className="w-full px-3 py-1.5 text-xs bg-accent-primary text-fg-inverse rounded-lg hover:bg-accent-primary-hover flex items-center justify-center gap-1.5"
          >
            <Download size={14} />
            {t('updater.download')}
          </button>
        </div>
      )}

      {status === 'downloading' && (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw size={14} className="text-accent-primary animate-spin" />
            <span className="text-xs font-semibold">
              {t('updater.downloading', { percent: Math.round(progress.percent) })}
            </span>
          </div>
          <div className="w-full h-1.5 bg-bg-subtle rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {status === 'downloaded' && (
        <div className="p-4">
          <span className="text-xs font-semibold text-accent-primary block mb-2">
            {t('updater.downloaded', { version })}
          </span>
          <p className="text-xs text-fg-secondary mb-3">{t('updater.restartHint')}</p>
          <button
            onClick={installUpdate}
            className="w-full px-3 py-1.5 text-xs bg-accent-primary text-fg-inverse rounded-lg hover:bg-accent-primary-hover"
          >
            {t('updater.restart')}
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-danger">{t('updater.error')}</span>
            <button className="text-fg-muted hover:text-fg">
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-fg-muted">{errorMessage}</p>
        </div>
      )}
    </div>
  )
}
