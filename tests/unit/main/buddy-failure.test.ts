import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BuddyRunner } from '../../../src/main/buddy/runner'
import { BuddyStore } from '../../../src/main/buddy/store'

describe('BuddyRunner failure handling', () => {
  it('marks task failed when actor exits non-zero', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-failure-'))
    const fake = join(root, 'fake-fail.js')
    await writeFile(fake, "process.stderr.write('boom\\n'); process.exit(2)\n")

    const store = new BuddyStore(root)
    const created = await store.createTask({
      task_id: 'demo',
      repo_root: '/tmp/repo',
      settings: {
        launchers: {
          codex: { command: `${process.execPath} ${fake}`, env: {}, timeout_seconds: 5 }
        }
      }
    })
    const runner = new BuddyRunner(store)

    await expect(runner.startTask('demo', {
      workspace_key: created.workspace_key,
      actor: 'codex'
    })).rejects.toThrow()

    const detail = await store.getTaskDetail('demo', created.workspace_key)
    expect(detail.state.status).toBe('FAILED')
    expect(detail.latest_failure?.message).toContain('boom')
  })

  it('retries the failed actor from FAILED state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-retry-failed-'))
    const store = new BuddyStore(root)
    const created = await store.createTask({ task_id: 'demo', repo_root: '/tmp/repo' })
    await store.updateTaskState('demo', created.workspace_key, (state) => ({
      ...state,
      status: 'FAILED',
      next_actor: 'claude',
      active_run: null,
      latest_failure: {
        actor: 'codex',
        message: 'boom',
        ts: '2026-05-26T07:00:00.000Z'
      }
    }))
    const runner = new BuddyRunner(store, { executeLaunchers: false })

    await runner.startTask('demo', {
      workspace_key: created.workspace_key
    })

    const detail = await store.getTaskDetail('demo', created.workspace_key)
    expect(detail.state.status).toBe('RUNNING_CODEX')
    expect(detail.state.active_run?.actor).toBe('codex')
    expect(detail.latest_failure).toBeNull()
  })
})
