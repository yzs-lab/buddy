import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  CreateTaskInput,
  CreateTaskResult,
  Event,
  GlobalSettings,
  Launcher,
  Task,
  TaskDetail,
  TaskSettings,
  TaskState,
  TranscriptEntry
} from '../../shared/types'
import { normalizeGlobalSettings, normalizeLaunchers } from '../../shared/defaults'
import { createBuddyPaths, taskDir, workspaceKeyForRepo } from './paths'
import { redactJsonValue } from './redact'
import { parseEventLine, parseGlobalSettings, parseTaskSettings, parseTaskState } from './schemas'

interface TaskMeta {
  task_text?: string
  context_text?: string
}

export class BuddyStore {
  constructor(public readonly dataRoot: string) {}

  async getTasks(): Promise<Task[]> {
    const paths = createBuddyPaths(this.dataRoot)
    const workspaceKeys = await listDirectoryNames(paths.workspacesDir)
    const tasks: Task[] = []

    for (const workspaceKey of workspaceKeys) {
      const tasksDir = join(paths.workspacesDir, workspaceKey, 'tasks')
      const taskIds = await listDirectoryNames(tasksDir)
      for (const taskId of taskIds) {
        try {
          const state = await this.readTaskState(taskId, workspaceKey)
          tasks.push({
            task_id: taskId,
            workspace_key: workspaceKey,
            status: state.status,
            updated_at: state.updated_at ?? '',
            repo_root: state.repo_root ?? '',
            round: state.round,
            active_run: state.active_run ?? null
          })
        } catch {
          // Ignore unreadable task directories; schema errors surface on detail load.
        }
      }
    }

    return tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }

  async getTaskDetail(taskId: string, workspaceKey: string): Promise<TaskDetail> {
    const state = await this.readTaskState(taskId, workspaceKey)
    const settings = await this.readTaskSettings(taskId, workspaceKey)
    const meta = await this.readTaskMeta(taskId, workspaceKey)
    const events = await this.readEvents(taskId, workspaceKey)

    return {
      task_id: taskId,
      workspace_key: workspaceKey,
      state,
      settings,
      task_text: meta.task_text ?? '',
      context_text: meta.context_text ?? '',
      transcript: await this.readTranscript(taskId, workspaceKey, events),
      events,
      latest_failure: state.latest_failure ?? null
    }
  }

  async getEvents(taskId: string, since: number, workspaceKey: string): Promise<{ events: Event[] }> {
    const events = await this.readEvents(taskId, workspaceKey)
    return { events: events.filter((event) => event.seq > since) }
  }

  async createTask(input: CreateTaskInput): Promise<CreateTaskResult> {
    const repoRoot = input.repo_root ?? ''
    const workspaceKey = workspaceKeyForRepo(repoRoot || input.task_id)
    const dir = this.taskDirectory(input.task_id, workspaceKey)
    const now = new Date().toISOString()

    const globalSettings = await this.readGlobalSettings()

    await mkdir(join(dir, 'artifacts'), { recursive: true })
    await atomicWriteJson(join(dir, 'settings.json'), defaultTaskSettings(globalSettings, input.settings))
    await atomicWriteJson(join(dir, 'state.json'), defaultTaskState(repoRoot, now))
    await atomicWriteJson(join(dir, 'task.json'), {
      task_text: input.task_text ?? '',
      context_text: input.context_text ?? ''
    })
    await atomicWriteText(join(dir, 'transcript.md'), initialTranscript(input, now))
    await appendEventLine(join(dir, 'events.jsonl'), {
      seq: 1,
      type: 'task.created',
      ts: now,
      payload: {
        task_text: input.task_text ?? '',
        context_text: input.context_text ?? ''
      }
    })

    return { task: input.task_id, path: dir, workspace_key: workspaceKey }
  }

  async deleteTask(taskId: string, workspaceKey: string): Promise<void> {
    await rm(this.taskDirectory(taskId, workspaceKey), { recursive: true, force: true })
  }

  async updateGlobalSettings(settings: GlobalSettings): Promise<GlobalSettings> {
    const path = createBuddyPaths(this.dataRoot).globalSettings
    const normalized = normalizeGlobalSettings(settings)
    await atomicWriteJson(path, normalized)
    return normalized
  }

  async readGlobalSettings(): Promise<GlobalSettings> {
    const path = createBuddyPaths(this.dataRoot).globalSettings
    const legacyPath = join(this.dataRoot, 'global_settings.json')
    try {
      const parsed = parseGlobalSettings(await readJson(path)) as GlobalSettings
      return normalizeGlobalSettings(parsed)
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }

    try {
      const parsed = parseGlobalSettings(await readJson(legacyPath)) as GlobalSettings
      return normalizeGlobalSettings(parsed)
    } catch (error) {
      if (isNotFoundError(error)) return normalizeGlobalSettings()
      throw error
    }
  }

  async readTaskState(taskId: string, workspaceKey: string): Promise<TaskState> {
    return parseTaskState(await readJson(this.statePath(taskId, workspaceKey))) as TaskState
  }

  async readTaskSettings(taskId: string, workspaceKey: string): Promise<TaskSettings> {
    return parseTaskSettings(await readJson(this.settingsPath(taskId, workspaceKey))) as TaskSettings
  }

  async updateTaskState(
    taskId: string,
    workspaceKey: string,
    update: (state: TaskState) => TaskState
  ): Promise<TaskState> {
    const next = update(await this.readTaskState(taskId, workspaceKey))
    await atomicWriteJson(this.statePath(taskId, workspaceKey), next)
    return next
  }

  async appendTaskEvent(
    taskId: string,
    workspaceKey: string,
    event: Omit<Event, 'seq' | 'ts'> & Partial<Pick<Event, 'seq' | 'ts'>>
  ): Promise<Event> {
    const events = await this.readEvents(taskId, workspaceKey)
    const next: Event = {
      seq: event.seq ?? events.reduce((max, item) => Math.max(max, item.seq), 0) + 1,
      ts: event.ts ?? new Date().toISOString(),
      type: event.type,
      actor: event.actor,
      payload: event.payload
    }
    const redacted = redactJsonValue(next)
    await appendEventLine(this.eventsPath(taskId, workspaceKey), redacted)
    return redacted
  }

  async appendTranscript(taskId: string, workspaceKey: string, text: string): Promise<void> {
    await atomicAppendText(join(this.taskDirectory(taskId, workspaceKey), 'transcript.md'), text)
  }

  taskDirectory(taskId: string, workspaceKey: string): string {
    return taskDir(createBuddyPaths(this.dataRoot), workspaceKey, taskId)
  }

  statePath(taskId: string, workspaceKey: string): string {
    return join(this.taskDirectory(taskId, workspaceKey), 'state.json')
  }

  settingsPath(taskId: string, workspaceKey: string): string {
    return join(this.taskDirectory(taskId, workspaceKey), 'settings.json')
  }

  eventsPath(taskId: string, workspaceKey: string): string {
    return join(this.taskDirectory(taskId, workspaceKey), 'events.jsonl')
  }

  private async readTaskMeta(taskId: string, workspaceKey: string): Promise<TaskMeta> {
    const path = join(this.taskDirectory(taskId, workspaceKey), 'task.json')
    try {
      return await readJson(path) as TaskMeta
    } catch {
      return this.readLegacyTaskMeta(taskId, workspaceKey)
    }
  }

  private async readLegacyTaskMeta(taskId: string, workspaceKey: string): Promise<TaskMeta> {
    const dir = this.taskDirectory(taskId, workspaceKey)
    const [taskText, contextText] = await Promise.all([
      readOptionalText(join(dir, 'task.md')),
      readOptionalText(join(dir, 'context.md'))
    ])
    return {
      task_text: taskText,
      context_text: contextText
    }
  }

  private async readEvents(taskId: string, workspaceKey: string): Promise<Event[]> {
    const path = this.eventsPath(taskId, workspaceKey)
    try {
      const text = await readFile(path, 'utf8')
      return text
        .split(/\r?\n/)
        .filter(Boolean)
        .map(parseEventLine) as Event[]
    } catch {
      return []
    }
  }

  private async readTranscript(
    taskId: string,
    workspaceKey: string,
    events: Event[]
  ): Promise<TranscriptEntry[]> {
    const fromEvents = transcriptFromEvents(events)
    if (fromEvents.length > 0) return fromEvents

    const markdown = await readOptionalText(join(this.taskDirectory(taskId, workspaceKey), 'transcript.md'))
    return transcriptFromMarkdown(markdown)
  }
}

const TRANSCRIPT_ROLES = new Set<TranscriptEntry['role']>([
  'human',
  'claude',
  'codex',
  'opencode',
  'kimi',
  'system'
])

function transcriptFromEvents(events: Event[]): TranscriptEntry[] {
  return events.flatMap((event) => {
    const content = contentFromEvent(event)
    if (!content) return []
    return [{
      role: roleFromEvent(event),
      content,
      ts: event.ts
    }]
  })
}

function roleFromEvent(event: Event): TranscriptEntry['role'] {
  if (event.type === 'human.message' || event.type === 'message.added') return 'human'
  if (event.type === 'actor.failed') return 'system'
  return normalizeTranscriptRole(event.actor ?? textValue(event.payload.actor)) ?? 'system'
}

function contentFromEvent(event: Event): string {
  const payload = event.payload
  if (event.type === 'human.message') {
    return normalizeTranscriptContent(textValue(payload.content) ?? textValue(payload.message) ?? '')
  }
  if (event.type === 'message.added') {
    return normalizeTranscriptContent(textValue(payload.message) ?? textValue(payload.content) ?? '')
  }
  if (event.type === 'actor.completed') {
    return normalizeTranscriptContent(textValue(payload.text) ?? textValue(payload.message) ?? '')
  }
  if (event.type === 'actor.failed') {
    return normalizeTranscriptContent(textValue(payload.error) ?? '')
  }
  if (event.type === 'assistant') {
    return normalizeTranscriptContent(textFromAssistantPayload(payload))
  }
  return ''
}

function textFromAssistantPayload(payload: Record<string, unknown>): string {
  const message = payload.message
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const content = (message as { content?: unknown }).content
    if (Array.isArray(content)) {
      return content
        .map(textFromContentPart)
        .filter(Boolean)
        .join('\n')
    }
  }
  return textValue(payload.text) ?? textValue(payload.content) ?? ''
}

function textFromContentPart(part: unknown): string {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return ''
  const candidate = part as { type?: unknown; text?: unknown }
  if ((candidate.type === 'text' || candidate.type === 'output_text') && typeof candidate.text === 'string') {
    return candidate.text
  }
  return ''
}

function transcriptFromMarkdown(markdown: string): TranscriptEntry[] {
  const text = markdown.trim()
  if (!text) return []

  const entries: TranscriptEntry[] = []
  let currentRole: TranscriptEntry['role'] | null = null
  let currentLines: string[] = []
  let sawHeading = false

  const flush = () => {
    if (!currentRole) return
    const content = normalizeTranscriptContent(currentLines.join('\n'))
    if (content) entries.push({ role: currentRole, content, ts: '' })
  }

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##+\s+(.+?)\s*$/)
    if (heading) {
      sawHeading = true
      flush()
      currentRole = normalizeTranscriptRole(heading[1])
      currentLines = []
      continue
    }
    if (currentRole) currentLines.push(line)
  }

  flush()
  if (entries.length > 0 || sawHeading) return entries
  return [{ role: 'system', content: text, ts: '' }]
}

function normalizeTranscriptRole(value: unknown): TranscriptEntry['role'] | null {
  if (typeof value !== 'string') return null
  const role = value.trim().toLowerCase()
  return TRANSCRIPT_ROLES.has(role as TranscriptEntry['role'])
    ? role as TranscriptEntry['role']
    : null
}

function normalizeTranscriptContent(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  const unwrapped = unwrapJsonContent(candidate)
  return unwrapped ?? trimmed
}

function unwrapJsonContent(value: string): string | null {
  try {
    const parsed = JSON.parse(value)
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof (parsed as { content?: unknown }).content === 'string'
    ) {
      return ((parsed as { content: string }).content).trim()
    }
  } catch {}
  return null
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

async function listDirectoryNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await atomicWriteText(path, JSON.stringify(value))
}

async function atomicWriteText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`
  await writeFile(tmp, value)
  await rename(tmp, path)
}

async function appendEventLine(path: string, event: Event): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(event)}\n`, { flag: 'a' })
}

async function atomicAppendText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value, { flag: 'a' })
}

function defaultTaskSettings(
  globalSettings: GlobalSettings,
  overrides: Record<string, unknown> = {}
): TaskSettings {
  const normalizedGlobal = normalizeGlobalSettings(globalSettings)
  const { launchers: overrideLaunchers, ...restOverrides } = overrides
  const launchers = normalizeLaunchers({
    ...normalizedGlobal.launchers,
    ...coerceLauncherOverrides(overrideLaunchers)
  })

  return {
    protocol_version: normalizedGlobal.protocol_version ?? '1',
    countdown_seconds: normalizedGlobal.countdown_seconds ?? 30,
    flow_policy: 'claude_then_codex',
    role_mode: 'claude_implements',
    launchers,
    max_rounds: normalizedGlobal.max_rounds,
    max_consecutive_failures: normalizedGlobal.max_consecutive_failures,
    ...restOverrides
  } as TaskSettings
}

function coerceLauncherOverrides(value: unknown): Record<string, Partial<Launcher>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const launchers: Record<string, Partial<Launcher>> = {}
  for (const [actor, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const candidate = raw as Partial<Launcher>
    launchers[actor] = {
      command: candidate.command,
      env: candidate.env,
      timeout_seconds: candidate.timeout_seconds
    }
  }
  return launchers
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function defaultTaskState(repoRoot: string, now: string): TaskState {
  return {
    status: 'READY',
    round: 1,
    next_actor: 'claude',
    active_run: null,
    updated_at: now,
    repo_root: repoRoot,
    pending_break: null
  }
}

function initialTranscript(input: CreateTaskInput, now: string): string {
  const lines = [
    `# ${input.task_id}`,
    '',
    `Created: ${now}`,
    '',
    '## Task',
    input.task_text ?? '',
    '',
    '## Context',
    input.context_text ?? ''
  ]
  return `${lines.join('\n')}\n`
}
