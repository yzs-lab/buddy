import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openInVSCode } from '../../../src/main/open-in-vscode'

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}))

describe('openInVSCode', () => {
  const spawnMock = vi.mocked(spawn)

  beforeEach(() => {
    spawnMock.mockReset()
  })

  it('passes the project path directly to the code CLI', async () => {
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> }
    child.unref = vi.fn()
    spawnMock.mockReturnValue(child as never)

    const opened = openInVSCode('/tmp/project with spaces')

    expect(spawnMock).toHaveBeenCalledWith('code', ['/tmp/project with spaces'], {
      detached: true,
      stdio: 'ignore'
    })

    child.emit('spawn')
    await expect(opened).resolves.toBeUndefined()
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('reports when the code CLI cannot be started', async () => {
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> }
    child.unref = vi.fn()
    spawnMock.mockReturnValue(child as never)

    const opened = openInVSCode('/tmp/project')
    const result = expect(opened).rejects.toThrow('code command not found')

    child.emit('error', new Error('code command not found'))
    await result
    expect(child.unref).not.toHaveBeenCalled()
  })
})
