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

  it('detects error-only output even when exit code is 0', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-error-output-'))
    const fake = join(root, 'fake-error-output.js')
    await writeFile(fake, `
const line = JSON.stringify({ type: 'error', error: { name: 'APIError', data: { message: 'Subscription expired', statusCode: 400 } } });
process.stdout.write(line + '\\n');
process.exit(0);
`)

    const store = new BuddyStore(root)
    const created = await store.createTask({
      task_id: 'demo',
      repo_root: '/tmp/repo',
      settings: {
        launchers: {
          opencode: { command: `${process.execPath} ${fake}`, env: {}, timeout_seconds: 5 }
        }
      }
    })
    const runner = new BuddyRunner(store)

    await expect(runner.startTask('demo', {
      workspace_key: created.workspace_key,
      actor: 'opencode'
    })).rejects.toThrow()

    const detail = await store.getTaskDetail('demo', created.workspace_key)
    expect(detail.state.status).toBe('FAILED')
    expect(detail.state.consecutive_failures).toBe(1)
  })

  it('auto-confirms pending break when other actor fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-break-on-fail-'))
    const fake = join(root, 'fake-fail-break.js')
    await writeFile(fake, "process.stderr.write('API error\\n'); process.exit(1)\n")

    const store = new BuddyStore(root)
    const created = await store.createTask({
      task_id: 'demo',
      repo_root: '/tmp/repo',
      settings: {
        launchers: {
          opencode: { command: `${process.execPath} ${fake}`, env: {}, timeout_seconds: 5 }
        }
      }
    })
    await store.updateTaskState('demo', created.workspace_key, (state) => ({
      ...state,
      pending_break: { actor: 'claude', round: 5 }
    }))

    const runner = new BuddyRunner(store)

    await expect(runner.startTask('demo', {
      workspace_key: created.workspace_key,
      actor: 'opencode'
    })).rejects.toThrow()

    const detail = await store.getTaskDetail('demo', created.workspace_key)
    expect(detail.state.status).toBe('DONE')
    expect(detail.state.pending_break).toBeNull()
    const doneEvent = detail.events.find((e) => e.type === 'task.done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent?.payload.reason).toBe('break_confirmed_on_failure')
  })

  it('pauses task when consecutive failures reach max threshold', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-max-failures-'))
    const fake = join(root, 'fake-fail-max.js')
    await writeFile(fake, "process.stderr.write('fail\\n'); process.exit(1)\n")

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
    await store.updateTaskState('demo', created.workspace_key, (state) => ({
      ...state,
      consecutive_failures: 2,
      status: 'FAILED',
      active_run: null,
      latest_failure: { actor: 'codex', message: 'previous fail', ts: new Date().toISOString() }
    }))

    const runner = new BuddyRunner(store)

    await expect(runner.startTask('demo', {
      workspace_key: created.workspace_key,
      actor: 'codex'
    })).rejects.toThrow()

    const detail = await store.getTaskDetail('demo', created.workspace_key)
    expect(detail.state.status).toBe('PAUSED')
    expect(detail.state.consecutive_failures).toBe(3)
    const thresholdEvent = detail.events.find((e) => e.type === 'failure_threshold.reached')
    expect(thresholdEvent).toBeDefined()
  })

  it('does not auto-confirm break when the failing actor has the pending break', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-same-actor-fail-'))
    const fake = join(root, 'fake-fail-same.js')
    await writeFile(fake, "process.stderr.write('fail\\n'); process.exit(1)\n")

    const store = new BuddyStore(root)
    const created = await store.createTask({
      task_id: 'demo',
      repo_root: '/tmp/repo',
      settings: {
        launchers: {
          opencode: { command: `${process.execPath} ${fake}`, env: {}, timeout_seconds: 5 }
        }
      }
    })
    await store.updateTaskState('demo', created.workspace_key, (state) => ({
      ...state,
      pending_break: { actor: 'opencode', round: 5 }
    }))

    const runner = new BuddyRunner(store)

    await expect(runner.startTask('demo', {
      workspace_key: created.workspace_key,
      actor: 'opencode'
    })).rejects.toThrow()

    const detail = await store.getTaskDetail('demo', created.workspace_key)
    expect(detail.state.status).toBe('FAILED')
  })
})
