export interface ParsedActorLine {
  text?: string
  sessionId?: string
  threadId?: string
  rawType?: string
}

export type BuddyMessage =
  | { kind: 'break'; content: string; reason?: string }
  | { kind: 'message'; text: string }

export function parseClaudeStreamLine(line: string): ParsedActorLine {
  const json = JSON.parse(line)
  const text = Array.isArray(json.message?.content)
    ? json.message.content
        .filter((part: { type?: string; text?: string }) => part.type === 'text' && part.text)
        .map((part: { text: string }) => part.text)
        .join('')
    : undefined

  return {
    text,
    sessionId: claudeSessionIdFromEvent(json),
    rawType: json.type
  }
}

export function parseCodexJsonLine(line: string): ParsedActorLine {
  const json = JSON.parse(line)
  const itemText = json.item && typeof json.item === 'object' && !Array.isArray(json.item)
    ? (json.item as { text?: unknown }).text
    : undefined
  const text = Array.isArray(json.content)
    ? json.content
        .filter((part: { text?: string }) => part.text)
        .map((part: { text: string }) => part.text)
        .join('')
    : typeof itemText === 'string'
      ? itemText
      : json.message

  return {
    text,
    sessionId: stableSessionIdFromEvent('codex', json),
    threadId: stableThreadIdFromEvent('codex', json) ?? textValue(json.thread_id),
    rawType: json.type
  }
}

export function parseOpenCodeJsonLine(line: string): ParsedActorLine {
  const json = JSON.parse(line)
  const part = objectValue(json.part)
  const text = json.type === 'text'
    ? textValue(part?.text)
    : json.type === 'error'
      ? stringifyValue(json.error)
      : undefined

  return {
    text,
    sessionId: stableSessionIdFromEvent('opencode', json) ?? textValue(json.sessionID),
    rawType: json.type
  }
}

export function parseKimiJsonLine(line: string): ParsedActorLine {
  const json = JSON.parse(line)
  const text = json.role === 'assistant' ? textValue(json.content) : undefined

  return {
    text,
    sessionId: stableSessionIdFromEvent('kimi', json),
    rawType: json.type ?? json.role
  }
}

export function parseActorLine(actor: string, line: string): ParsedActorLine {
  if (actor === 'claude') return parseClaudeStreamLine(line)
  if (actor === 'codex') return parseCodexJsonLine(line)
  if (actor === 'opencode') return parseOpenCodeJsonLine(line)
  if (actor === 'kimi') return parseKimiJsonLine(line)
  return parseCodexJsonLine(line)
}

export function parseActorEvents(actor: string, rawEvents: string): ParsedActorLine[] {
  return rawEvents.split(/\r?\n/).flatMap((raw) => {
    if (!raw.trim()) return []
    try {
      return [parseActorLine(actor, raw)]
    } catch {
      return [{ text: raw }]
    }
  })
}

export function extractActorOutput(actor: string, rawEvents: string): string {
  if (actor === 'claude') return extractClaudeOutput(rawEvents)
  if (actor === 'opencode') return extractOpenCodeOutput(rawEvents)
  if (actor === 'kimi') return extractKimiOutput(rawEvents)
  return extractGenericJsonOutput(rawEvents)
}

export function parseBuddyMessage(text: string): BuddyMessage {
  const trimmed = text.trim()
  const jsonMessage = parseBuddyJsonMessage(trimmed)
  if (jsonMessage) return jsonMessage

  const fields = new Map<string, string>()
  for (const line of trimmed.split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index !== -1) fields.set(line.slice(0, index), line.slice(index + 1))
  }

  if (fields.get('type') === 'break') {
    const reason = fields.get('reason')
    return { kind: 'break', reason, content: reason ?? text }
  }

  return { kind: 'message', text }
}

function parseBuddyJsonMessage(text: string): BuddyMessage | null {
  const fenced = text.match(/```json\s*(\{[\s\S]*\})\s*```/i)
  if (fenced) {
    const parsed = parseBuddyJsonCandidate(fenced[1])
    if (parsed) return parsed
    const loose = looseExtractBuddyMessage(fenced[1])
    if (loose) return loose
  }

  const parsed = parseBuddyJsonCandidate(text)
  if (parsed) return parsed

  const loose = looseExtractBuddyMessage(text)
  if (loose) return loose

  const obj = findBuddyJsonObject(text)
  if (obj) {
    const objParsed = parseBuddyJsonCandidate(obj)
    if (objParsed) return objParsed
    const objLoose = looseExtractBuddyMessage(obj)
    if (objLoose) return objLoose
  }

  const unescaped = tryUnescapeJson(text)
  if (unescaped) {
    const uobj = findBuddyJsonObject(unescaped) ?? unescaped
    const uparsed = parseBuddyJsonCandidate(uobj)
    if (uparsed) return uparsed
    const uloose = looseExtractBuddyMessage(uobj)
    if (uloose) return uloose
  }

  return null
}

function findBuddyJsonObject(text: string): string | null {
  const match = text.match(/\{\s*"type"\s*:\s*"(chat|break)"/)
  if (!match || match.index === undefined) return null

  let depth = 0
  let inString = false
  let inBacktick = false
  let escape = false
  let start = match.index

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inBacktick) {
      if (ch === '`') inBacktick = false
      continue
    }
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '`' && !inString) { inBacktick = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

function tryUnescapeJson(text: string): string | null {
  if (!text.includes('\\"')) return null
  const unescaped = text.replace(/\\"/g, '"')
  if (!/\{\s*"type"\s*:\s*"(chat|break)"/.test(unescaped)) return null
  return unescaped
}

function findClosingContentQuote(text: string): number {
  const len = text.length
  let pos = len - 1

  while (pos >= 0 && (text[pos] === ' ' || text[pos] === '\t' || text[pos] === '\n' || text[pos] === '\r')) pos--
  if (pos < 0 || text[pos] !== '}') return -1
  pos--
  while (pos >= 0 && (text[pos] === ' ' || text[pos] === '\t' || text[pos] === '\n' || text[pos] === '\r')) pos--
  if (pos < 0 || text[pos] !== '"') return -1

  return pos
}

function parseBuddyJsonCandidate(text: string): BuddyMessage | null {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const type = (parsed as { type?: unknown }).type
    const content = (parsed as { content?: unknown }).content
    if ((type === 'chat' || type === 'break') && typeof content === 'string') {
      return type === 'break'
        ? { kind: 'break', content }
        : { kind: 'message', text: content }
    }
  } catch {}
  return null
}

function looseExtractBuddyMessage(text: string): BuddyMessage | null {
  const typeMatch = text.match(/"type"\s*:\s*"(chat|break)"/)
  if (!typeMatch) return null

  const kind = typeMatch[1] as 'chat' | 'break'

  const contentKeyMatch = text.match(/"content"\s*:\s*"/)
  if (!contentKeyMatch || contentKeyMatch.index === undefined) return null

  const contentStart = contentKeyMatch.index + contentKeyMatch[0].length
  const closingQuote = findClosingContentQuote(text)
  const raw = closingQuote !== -1 && closingQuote > contentStart
    ? text.slice(contentStart, closingQuote)
    : text.slice(contentStart)
  const content = unescapeJsonString(raw)

  return kind === 'break'
    ? { kind: 'break', content }
    : { kind: 'message', text: content }
}

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
}

function extractClaudeOutput(rawEvents: string): string {
  let result = ''
  const chunks: string[] = []
  for (const event of parseJsonEvents(rawEvents)) {
    const eventResult = textValue(event.result)
    if (event.type === 'result' && eventResult) result = eventResult
    const text = textValue(event.text)
    if (text) chunks.push(text)
    const message = objectValue(event.message)
    const content = message?.content
    if (Array.isArray(content)) {
      chunks.push(...content.map(textFromContentPart).filter(Boolean))
    }
  }
  return (result || chunks.join('\n')).trim()
}

function extractOpenCodeOutput(rawEvents: string): string {
  const chunks: string[] = []
  for (const event of parseJsonEvents(rawEvents)) {
    if (event.type === 'text') {
      const part = objectValue(event.part)
      const text = textValue(part?.text)
      if (text) chunks.push(text)
    } else if (event.type === 'error') {
      const error = stringifyValue(event.error)
      if (error) chunks.push(error)
    }
  }
  return chunks.join('').trim()
}

function extractKimiOutput(rawEvents: string): string {
  let lastContent = ''
  for (const event of parseJsonEvents(rawEvents)) {
    if (event.role === 'assistant') {
      const content = textValue(event.content)
      if (content) lastContent = content
    }
  }
  return lastContent.trim()
}

function extractGenericJsonOutput(rawEvents: string): string {
  const chunks: string[] = []
  for (const event of parseJsonEvents(rawEvents)) {
    const item = objectValue(event.item)
    const itemText = textValue(item?.text)
    const message = textValue(event.message)
    const content = event.content
    if (Array.isArray(content)) {
      chunks.push(...content.map(textFromContentPart).filter(Boolean))
    } else if (itemText) {
      chunks.push(itemText)
    } else if (message) {
      chunks.push(message)
    }
  }
  return chunks.join('\n').trim()
}

function parseJsonEvents(rawEvents: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = []
  for (const raw of rawEvents.split(/\r?\n/)) {
    if (!raw.trim()) continue
    try {
      const event = JSON.parse(raw)
      if (event && typeof event === 'object' && !Array.isArray(event)) events.push(event)
    } catch {}
  }
  return events
}

function claudeSessionIdFromEvent(event: Record<string, unknown>): string | undefined {
  const sessionId = textValue(event.session_id)
  if (!sessionId) return undefined

  const eventType = textValue(event.type)
  const subtype = textValue(event.subtype) ?? ''
  if (eventType === 'system') {
    if (subtype === 'init') return sessionId
    if (subtype.startsWith('hook_') || event.hook_event) return undefined
  }
  if (eventType === 'result' || eventType === 'assistant' || eventType === 'user') return sessionId
  if (eventType !== 'system') return sessionId
  return undefined
}

function stableSessionIdFromEvent(actor: string, event: Record<string, unknown>): string | undefined {
  if (event.type !== 'buddy.session' || event.actor !== actor) return undefined
  if (actor === 'codex') return undefined
  return textValue(event.session_id)
}

function stableThreadIdFromEvent(actor: string, event: Record<string, unknown>): string | undefined {
  if (actor === 'codex' && event.type === 'buddy.session' && event.actor === 'codex') {
    return textValue(event.thread_id) ?? textValue(event.session_id)
  }
  if (actor === 'codex' && event.type === 'thread.started') return textValue(event.thread_id)
  return undefined
}

function textFromContentPart(part: unknown): string {
  const candidate = objectValue(part)
  if (!candidate) return ''
  const type = candidate.type
  return (type === 'text' || type === 'output_text') ? textValue(candidate.text) ?? '' : ''
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function stringifyValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return undefined
  return JSON.stringify(value)
}
