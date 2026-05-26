import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BuddyStore } from '../../../src/main/buddy/store'

describe('BuddyStore writes', () => {
  it('creates a task with state, settings, transcript, metadata, and initial event', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-write-'))
    const store = new BuddyStore(root)

    const result = await store.createTask({
      task_id: 'demo',
      repo_root: '/tmp/repo',
      task_text: 'Build it',
      context_text: 'Use tests'
    })

    const taskDir = join(root, 'workspaces', result.workspace_key, 'tasks', 'demo')
    await expect(readFile(join(taskDir, 'state.json'), 'utf8')).resolves.toContain('"status":"READY"')
    await expect(readFile(join(taskDir, 'settings.json'), 'utf8')).resolves.toContain('"protocol_version":"1"')
    await expect(readFile(join(taskDir, 'task.json'), 'utf8')).resolves.toContain('"task_text":"Build it"')
    await expect(readFile(join(taskDir, 'transcript.md'), 'utf8')).resolves.toContain('Build it')
    await expect(readFile(join(taskDir, 'events.jsonl'), 'utf8')).resolves.toContain('"task.created"')
  })

  it('uses global CLI settings when creating a task without explicit launchers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-write-global-'))
    const store = new BuddyStore(root)
    await store.updateGlobalSettings({
      countdown_seconds: 12,
      launchers: {
        codex: {
          command: 'codex --profile native',
          env: { BUDDY_MODE: 'native' },
          timeout_seconds: 123
        }
      }
    })

    const result = await store.createTask({
      task_id: 'demo',
      repo_root: '/tmp/repo'
    })

    const taskDir = join(root, 'workspaces', result.workspace_key, 'tasks', 'demo')
    const settings = JSON.parse(await readFile(join(taskDir, 'settings.json'), 'utf8'))
    expect(settings.countdown_seconds).toBe(12)
    expect(settings.launchers.codex).toEqual({
      command: 'codex --profile native',
      env: { BUDDY_MODE: 'native' },
      timeout_seconds: 123
    })
  })
})
