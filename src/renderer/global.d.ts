import type { Api, BuddyApi } from '../preload'

declare global {
  interface Window {
    api: Api
    buddy: BuddyApi
  }
}

export {}
