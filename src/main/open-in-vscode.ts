import { spawn } from 'node:child_process'

export function openInVSCode(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('code', [path], {
      detached: true,
      stdio: 'ignore'
    })

    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
