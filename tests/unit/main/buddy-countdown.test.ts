import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BuddyRunner } from '../../../src/main/buddy/runner'
import { BuddyStore } from '../../../src/main/buddy/store'

describe('BuddyRunner countdown', () => {
  it('pauses a running countdown back to READY', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-countdown-'))
    const store = new BuddyStore(root)
    const created = await store.createTask({ task_id: 'demo', repo_root: '/tmp/repo' })
    await store.updateTaskState('demo', created.workspace_key, (state) => ({
      ...state,
      status: 'COUNTDOWN',
      countdown: { status: 'running', remaining: 30, default_next_actor: 'codex' }
    }))
    const runner = new BuddyRunner(store)

    await runner.pauseCountdown('demo', {
      workspace_key: created.workspace_key,
      next_actor: 'claude'
    })

    const detail = await store.getTaskDetail('demo', created.workspace_key)
    expect(detail.state.status).toBe('READY')
    expect(detail.state.next_actor).toBe('claude')
    expect(detail.state.countdown?.status).toBe('paused')
    expect(detail.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'countdown.paused',
        payload: expect.objectContaining({ next_actor: 'claude' })
      })
    ]))
  })
})
