import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import type { UpdateInfo as ElectronUpdateInfo } from 'electron-updater'

export interface UpdateInfo {
  version: string
  releaseDate?: string
  mandatory?: boolean
}

export interface DownloadProgress {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; info: UpdateInfo }
  | { type: 'not-available' }
  | { type: 'progress'; progress: DownloadProgress }
  | { type: 'downloaded'; info: UpdateInfo }
  | { type: 'error'; message: string }

// ELECTRON_UPDATER_ALLOW_HTTP is set in src/main/index.ts before this module is imported.

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let mainWindow: BrowserWindow | null = null
let initialized = false

function sendToRenderer(event: UpdaterEvent): void {
  mainWindow?.webContents.send('updater:event', event)
}

export function initUpdater(window: BrowserWindow): void {
  if (initialized) return
  initialized = true
  mainWindow = window

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer({ type: 'checking' })
  })

  autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
    sendToRenderer({
      type: 'available',
      info: {
        version: info.version,
        releaseDate: info.releaseDate,
        mandatory: (info as unknown as Record<string, unknown>).mandatory === true
      }
    })
  })

  autoUpdater.on('update-not-available', () => {
    sendToRenderer({ type: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress: { bytesPerSecond: number; percent: number; transferred: number; total: number }) => {
    sendToRenderer({
      type: 'progress',
      progress: {
        bytesPerSecond: progress.bytesPerSecond,
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total
      }
    })
  })

  autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
    sendToRenderer({
      type: 'downloaded',
      info: {
        version: info.version,
        releaseDate: info.releaseDate
      }
    })
  })

  autoUpdater.on('error', (err: Error | null) => {
    sendToRenderer({ type: 'error', message: err?.message ?? 'Unknown error' })
  })

  // Delay first check to avoid impacting startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 5000)
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch(() => {})
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch(() => {})
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
