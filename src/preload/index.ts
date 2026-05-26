import { contextBridge, ipcRenderer } from 'electron'
import { createBuddyPreloadApi } from './buddy-api'

const api = {
  selectDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory', defaultPath),
  openInFinder: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:openInFinder', path),
  onFullScreenChange: (callback: (isFullScreen: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isFullScreen: boolean) => callback(isFullScreen)
    ipcRenderer.on('window:fullScreenChange', handler)
    return () => { ipcRenderer.removeListener('window:fullScreenChange', handler) }
  },
  isFullScreen: (): Promise<boolean> =>
    ipcRenderer.invoke('window:isFullScreen')
}

const buddy = createBuddyPreloadApi(ipcRenderer)

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('buddy', buddy)

export type Api = typeof api
export type BuddyApi = typeof buddy
