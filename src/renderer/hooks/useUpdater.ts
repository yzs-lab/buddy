import { useCallback, useEffect, useState } from 'react'

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; info: { version: string; releaseDate?: string; mandatory?: boolean } }
  | { type: 'not-available' }
  | { type: 'progress'; progress: { bytesPerSecond: number; percent: number; transferred: number; total: number } }
  | { type: 'downloaded'; info: { version: string; releaseDate?: string } }
  | { type: 'error'; message: string }

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [version, setVersion] = useState<string>('')
  const [progress, setProgress] = useState({ percent: 0, bytesPerSecond: 0 })
  const [mandatory, setMandatory] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.api?.onUpdaterEvent) return
    return window.api.onUpdaterEvent((event: unknown) => {
      const e = event as UpdaterEvent
      switch (e.type) {
        case 'checking':
          setStatus('checking')
          break
        case 'available':
          setStatus('available')
          setVersion(e.info.version)
          setMandatory(e.info.mandatory ?? false)
          setDismissed(false)
          break
        case 'not-available':
          setStatus('idle')
          break
        case 'progress':
          setStatus('downloading')
          setProgress({ percent: e.progress.percent, bytesPerSecond: e.progress.bytesPerSecond })
          break
        case 'downloaded':
          setStatus('downloaded')
          setVersion(e.info.version)
          setDismissed(false)
          break
        case 'error':
          setStatus('error')
          setErrorMessage(e.message)
          break
      }
    })
  }, [])

  const checkForUpdates = useCallback(() => {
    window.api?.checkForUpdates?.()
  }, [])

  const downloadUpdate = useCallback(() => {
    window.api?.downloadUpdate?.()
  }, [])

  const installUpdate = useCallback(() => {
    window.api?.installUpdate?.()
  }, [])

  const dismissNotification = useCallback(() => {
    setDismissed(true)
  }, [])

  return { status, version, progress, mandatory, errorMessage, dismissed, checkForUpdates, downloadUpdate, installUpdate, dismissNotification }
}
