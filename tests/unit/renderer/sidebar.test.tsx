import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../../../src/renderer/components/Sidebar'
import type { Task } from '../../../src/shared/types'

describe('Sidebar', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show task round numbers in the task list', () => {
    const tasks: Task[] = [{
      task_id: 'demo',
      workspace_key: 'abc123def456',
      status: 'READY',
      updated_at: '',
      repo_root: '/tmp/repo',
      round: 3,
      active_run: null
    }]

    const html = renderToStaticMarkup(
      <Sidebar
        isOpen
        width={240}
        tasks={tasks}
        selectedTaskId={null}
        isLoading={false}
        error={null}
        isHealthy
        view="chat"
        settingsTab="general"
        onSelectTask={() => {}}
        onCreateTask={() => {}}
        onDeleteTask={() => {}}
        onOpenSettings={() => {}}
        onBackToApp={() => {}}
        onSelectSettingsTab={() => {}}
        onResize={() => {}}
        onToggleSidebar={() => {}}
        isFullScreen={false}
        onRenameProject={() => {}}
        onOpenInFinder={() => {}}
        onRemoveProject={() => {}}
        projectNames={{}}
      />
    )

    expect(html).toContain('demo')
    expect(html).not.toContain('Round 3')
    expect(html).not.toContain('第 3 轮')
  })

  it('does not show a live seconds timer under running task names', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-26T08:00:14.000Z'))

    const tasks: Task[] = [{
      task_id: 'running demo',
      workspace_key: 'abc123def456',
      status: 'RUNNING_CLAUDE',
      updated_at: '2026-05-26T08:00:14.000Z',
      repo_root: '/tmp/repo',
      round: 1,
      active_run: {
        actor: 'claude',
        started_at: '2026-05-26T08:00:00.000Z'
      }
    }]

    const html = renderToStaticMarkup(
      <Sidebar
        isOpen
        width={240}
        tasks={tasks}
        selectedTaskId="running demo"
        isLoading={false}
        error={null}
        isHealthy
        view="chat"
        settingsTab="general"
        onSelectTask={() => {}}
        onCreateTask={() => {}}
        onDeleteTask={() => {}}
        onOpenSettings={() => {}}
        onBackToApp={() => {}}
        onSelectSettingsTab={() => {}}
        onResize={() => {}}
        onToggleSidebar={() => {}}
        isFullScreen={false}
        onRenameProject={() => {}}
        onOpenInFinder={() => {}}
        onRemoveProject={() => {}}
        projectNames={{}}
      />
    )

    expect(html).toContain('running demo')
    expect(html).not.toContain('14s')
  })
})
