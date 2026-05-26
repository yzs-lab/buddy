import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Sidebar } from '../../../src/renderer/components/Sidebar'
import type { Task } from '../../../src/shared/types'

describe('Sidebar', () => {
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
})
