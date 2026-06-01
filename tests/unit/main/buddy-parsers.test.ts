import { describe, expect, it } from 'vitest'
import {
  extractActorOutput,
  parseActorLine,
  parseBuddyMessage,
  parseClaudeStreamLine,
  parseCodexJsonLine
} from '../../../src/main/buddy/parsers'

describe('buddy actor parsers', () => {
  it('extracts text from Claude stream-json content blocks', () => {
    const event = parseClaudeStreamLine(JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'hello' }]
      },
      session_id: 'claude-session'
    }))

    expect(event).toMatchObject({
      text: 'hello',
      sessionId: 'claude-session'
    })
  })

  it('extracts text from Codex json lines', () => {
    const event = parseCodexJsonLine(JSON.stringify({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'done' }],
      thread_id: 'codex-thread'
    }))

    expect(event).toMatchObject({
      text: 'done',
      threadId: 'codex-thread'
    })
  })

  it('extracts text from current Codex item.completed agent messages', () => {
    const event = parseCodexJsonLine(JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: '{"type":"chat","content":"review complete"}'
      }
    }))

    expect(event).toMatchObject({
      text: '{"type":"chat","content":"review complete"}'
    })
  })

  it('extracts OpenCode session IDs and text chunks while ignoring reasoning', () => {
    const session = parseActorLine('opencode', JSON.stringify({
      type: 'step_start',
      sessionID: 'opencode-session',
      part: { type: 'step-start' }
    }))
    const text = parseActorLine('opencode', JSON.stringify({
      type: 'text',
      sessionID: 'opencode-session',
      part: { type: 'text', text: 'Hello' }
    }))
    const reasoning = extractActorOutput('opencode', JSON.stringify({
      type: 'reasoning',
      sessionID: 'opencode-session',
      part: { type: 'reasoning', text: 'hidden' }
    }))

    expect(session).toMatchObject({ sessionId: 'opencode-session' })
    expect(text).toMatchObject({ sessionId: 'opencode-session', text: 'Hello' })
    expect(reasoning).toBe('')
  })

  it('extracts buddy messages from OpenCode tool_use output (echo commands)', () => {
    const output = extractActorOutput('opencode', [
      JSON.stringify({ type: 'text', sessionID: 's1', part: { type: 'text', text: 'Task done.' } }),
      JSON.stringify({ type: 'tool_use', sessionID: 's1', part: { type: 'tool', tool: 'bash', callID: 'c1', state: { status: 'completed', input: { command: "echo '{\"type\": \"break\", \"content\": \"All done.\"}'" }, output: '{"type": "break", "content": "All done."}' } } }),
    ].join('\n'))
    const message = parseBuddyMessage(output)

    expect(message).toEqual({ kind: 'break', content: 'All done.' })
  })

  it('extracts buddy messages from OpenCode tool_use when text events have no buddy JSON', () => {
    const output = extractActorOutput('opencode', [
      JSON.stringify({ type: 'text', sessionID: 's1', part: { type: 'text', text: 'I will signal completion.' } }),
      JSON.stringify({ type: 'tool_use', sessionID: 's1', part: { type: 'tool', tool: 'bash', callID: 'c1', state: { status: 'completed', input: { command: "echo hi" }, output: '{"type": "break", "content": "Done."}' } } }),
      JSON.stringify({ type: 'text', sessionID: 's1', part: { type: 'text', text: 'Echo command executed.' } }),
    ].join('\n'))
    const message = parseBuddyMessage(output)

    expect(message.kind).toBe('break')
  })

  it('streams buddy messages from OpenCode tool_use events', () => {
    const event = parseActorLine('opencode', JSON.stringify({
      type: 'tool_use',
      sessionID: 's1',
      part: { type: 'tool', tool: 'bash', callID: 'c1', state: { status: 'completed', input: { command: "echo break" }, output: '{"type": "break", "content": "Done."}' } }
    }))

    expect(event.text).toContain('"type": "break"')
  })

  it('keeps OpenCode JSON chunks adjacent when extracting output', () => {
    const output = extractActorOutput('opencode', [
      JSON.stringify({ type: 'text', sessionID: 's1', part: { type: 'text', text: '{"type":"ch' } }),
      JSON.stringify({ type: 'text', sessionID: 's1', part: { type: 'text', text: 'at","content":"hi"}' } })
    ].join('\n'))

    expect(output).toBe('{"type":"chat","content":"hi"}')
  })

  it('keeps only the last Kimi assistant content when extracting output', () => {
    const output = extractActorOutput('kimi', [
      JSON.stringify({ role: 'assistant', content: '{"type":"chat","content":"Part one"}' }),
      JSON.stringify({ role: 'tool', content: 'tool result' }),
      JSON.stringify({ role: 'assistant', content: '{"type":"chat","content":"Part two"}' })
    ].join('\n'))

    expect(output).toBe('{"type":"chat","content":"Part two"}')
  })

  it('extracts stable sessions from buddy.session events', () => {
    expect(parseActorLine('kimi', JSON.stringify({
      type: 'buddy.session',
      actor: 'kimi',
      session_id: 'kimi-session'
    }))).toMatchObject({
      sessionId: 'kimi-session'
    })
  })

  it('extracts session ID from kimi session.resume_hint meta event', () => {
    expect(parseActorLine('kimi', JSON.stringify({
      role: 'meta',
      type: 'session.resume_hint',
      session_id: 'session_f811580a-d17e-4e01-b900-92048f4b1455',
      command: 'kimi -r session_f811580a-d17e-4e01-b900-92048f4b1455',
      content: 'To resume this session: kimi -r session_f811580a-d17e-4e01-b900-92048f4b1455'
    }))).toMatchObject({
      sessionId: 'session_f811580a-d17e-4e01-b900-92048f4b1455',
      text: undefined
    })
  })

  it('detects break messages', () => {
    expect(parseBuddyMessage('type=break\nreason=done')).toMatchObject({
      kind: 'break',
      reason: 'done'
    })
  })

  it('unwraps buddy JSON chat and break envelopes', () => {
    expect(parseBuddyMessage('```json\n{"type":"chat","content":"hello"}\n```')).toMatchObject({
      kind: 'message',
      text: 'hello'
    })
    expect(parseBuddyMessage('{"type":"break","content":"done"}')).toMatchObject({
      kind: 'break',
      content: 'done'
    })
  })

  it('preserves markdown content from buddy JSON envelopes', () => {
    const markdown = '## Summary\n\n- Updated `src/main`\n- Kept transcript JSONL compatible\n'
    const message = parseBuddyMessage(JSON.stringify({ type: 'chat', content: markdown }))

    expect(message).toEqual({
      kind: 'message',
      text: markdown
    })
  })

  it('loosely extracts markdown content with unescaped quotes like buddy-python', () => {
    const message = parseBuddyMessage('```json\n{"type": "chat", "content": "## 结果\n\n这是一段包含"引号"的 markdown"}\n```')

    expect(message).toEqual({
      kind: 'message',
      text: '## 结果\n\n这是一段包含"引号"的 markdown'
    })
  })

  it('extracts buddy JSON preceded by preamble text', () => {
    const text = '所有测试通过，类型检查通过。让我总结一下所做的更改。\n{"type": "chat", "content": "## Changes Made\n\n### Root Cause\nThe error was fixed."}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: '## Changes Made\n\n### Root Cause\nThe error was fixed.'
    })
  })

  it('extracts buddy JSON with unescaped content after preamble', () => {
    const text = 'Preamble text here. {"type": "chat", "content": "Hello world"}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: 'Hello world'
    })
  })

  it('extracts break message from JSON with preamble', () => {
    const text = 'Task complete. {"type": "break", "content": "All done"}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'break',
      content: 'All done'
    })
  })

  it('extracts content with inline code containing brace-like patterns', () => {
    const text = '{"type": "chat", "content": "The fix uses `spawn kimi ENOENT` error handling in launchers.ts"}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: 'The fix uses `spawn kimi ENOENT` error handling in launchers.ts'
    })
  })

  it('extracts multiline content with code blocks containing braces', () => {
    const text = '{"type": "chat", "content": "## Changes\\n\\n```json\\n{\\"key\\": \\"value\\"}\\n```\\n\\nAll done."}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: '## Changes\n\n```json\n{"key": "value"}\n```\n\nAll done.'
    })
  })

  it('extracts content containing quote-brace pattern inside backticks', () => {
    const text = '{"type": "chat", "content": "Example closing: `"} at the end"}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: 'Example closing: `"} at the end'
    })
  })

  it('extracts buddy JSON from escaped JSON in preamble', () => {
    const text = 'Preamble \\"type\\": \\"chat\\" but real message: {"type": "chat", "content": "Working fix"}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: 'Working fix'
    })
  })

  it('handles fully escaped JSON embedded in text', () => {
    const text = 'Summary: {\\"type\\": \\"chat\\", \\"content\\": \\"All tests pass\\"}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: 'All tests pass'
    })
  })

  it('extracts long multiline content with preamble intact', () => {
    const text = 'Summary text here.\\n{"type": "chat", "content": "## Changes Made\\n\\n### Root Cause\\nThe `spawn kimi ENOENT` error occurs.\\n\\n### Files Changed\\n- file1.ts\\n- file2.ts\\n\\n### Verification\\nAll tests pass."}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: '## Changes Made\n\n### Root Cause\nThe `spawn kimi ENOENT` error occurs.\n\n### Files Changed\n- file1.ts\n- file2.ts\n\n### Verification\nAll tests pass.'
    })
  })

  it('handles valid JSON after preamble without quotes in preamble', () => {
    const text = 'Done. Here is the summary.\\n\\n{"type": "chat", "content": "Summary text."}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: 'Summary text.'
    })
  })

  it('extracts content when buddy JSON has actual newlines in content value', () => {
    const text = '所有修改看起来都正确。现在我将输出伙伴协议消息。\n{"type": "chat", "content": "## Changes Summary\n\n### Fix 1: Kimi ENOENT error\n\nThe error was fixed.\n- file1.ts\n- file2.ts\n\nAll tests pass."}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: '## Changes Summary\n\n### Fix 1: Kimi ENOENT error\n\nThe error was fixed.\n- file1.ts\n- file2.ts\n\nAll tests pass.'
    })
  })

  it('extracts content with actual newlines and inline code backticks', () => {
    const text = 'Preamble.\n{"type": "chat", "content": "The `kimi` binary was not found in PATH.\n\nInstall with `pip install kimi-cli`."}'
    const message = parseBuddyMessage(text)

    expect(message).toEqual({
      kind: 'message',
      text: 'The `kimi` binary was not found in PATH.\n\nInstall with `pip install kimi-cli`.'
    })
  })

  it('end-to-end: Claude stream-json with preamble + buddy JSON', () => {
    // Simulate what extractClaudeOutput produces when Claude outputs:
    // "All tests pass. Let me summarize.\n\n{"type": "chat", "content": "## Changes\n\n### Fix 1..."}"
    const streamEvents = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '所有修改看起来都正确。现在我将输出伙伴协议消息。\n\n{"type": "chat", "content": "## Changes Summary\\n\\n### Fix 1: Kimi ENOENT error\\n\\nAll tests pass."}'
          }]
        }
      })
    ].join('\n')
    const outputText = extractActorOutput('claude', streamEvents)
    const message = parseBuddyMessage(outputText)

    expect(message.kind).toBe('message')
    if (message.kind === 'message') {
      expect(message.text).not.toContain('"type"')
      expect(message.text).not.toContain('"content"')
      expect(message.text).toContain('## Changes Summary')
      expect(message.text).toContain('All tests pass.')
    }
  })

  it('end-to-end: Claude output with actual newlines in buddy JSON content', () => {
    // When Claude outputs buddy JSON with actual newlines (not \n escapes) in the content value,
    // the JSON is invalid. The loose extractor should still handle it.
    const streamEvents = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '所有修改看起来都正确。现在我将输出伙伴协议消息。\n\n{"type": "chat", "content": "## Changes Summary\n\n### Fix 1: Kimi ENOENT error\n\nAll tests pass."}'
          }]
        }
      })
    ].join('\n')
    const outputText = extractActorOutput('claude', streamEvents)
    const message = parseBuddyMessage(outputText)

    expect(message.kind).toBe('message')
    if (message.kind === 'message') {
      expect(message.text).not.toContain('"type"')
      expect(message.text).not.toContain('"content"')
      expect(message.text).toContain('## Changes Summary')
    }
  })

  it('end-to-end: Claude output with preamble on same line as JSON', () => {
    // Preamble + JSON on the same line (no newline between)
    const streamEvents = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '所有修改看起来都正确。现在我将输出伙伴协议消息。{"type": "chat", "content": "## Changes Summary\\n\\nAll tests pass."}'
          }]
        }
      })
    ].join('\n')
    const outputText = extractActorOutput('claude', streamEvents)
    const message = parseBuddyMessage(outputText)

    expect(message.kind).toBe('message')
    if (message.kind === 'message') {
      expect(message.text).not.toContain('"type"')
      expect(message.text).not.toContain('"content"')
      expect(message.text).toContain('## Changes Summary')
    }
  })

  it('extracts content with unescaped quotes in content (actual newlines in JSON)', () => {
    // When Claude outputs buddy JSON with actual newlines AND unescaped " in content,
    // the JSON is invalid but loose extractor should still find the content
    const text = '所有修改看起来都正确。\n{"type": "chat", "content": "Run `echo "$PATH"` to check.\n\nAll done."}'
    const message = parseBuddyMessage(text)

    expect(message.kind).toBe('message')
    if (message.kind === 'message') {
      expect(message.text).toContain('Run')
      expect(message.text).toContain('All done.')
    }
  })

  it('real-world: preamble + buddy JSON with long markdown content', () => {
    const content = '## Changes Summary\\n\\n### Fix 1: Kimi ENOENT error\\n\\n**Root cause**: macOS GUI apps don\'t inherit the user\'s shell PATH.\\n\\n**Files changed:**\\n- **`src/main/buddy/shell-path.ts`** (new)\\n- **`src/main/index.ts`**\\n- **`src/main/buddy/launchers.ts`**\\n\\n### Tests\\n- All 151 tests pass, typecheck clean, build succeeds'
    const streamEvents = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '所有修改看起来都正确。现在我将输出伙伴协议消息。\n\n{"type": "chat", "content": "' + content + '"}'
          }]
        }
      })
    ].join('\n')
    const outputText = extractActorOutput('claude', streamEvents)
    const message = parseBuddyMessage(outputText)

    expect(message.kind).toBe('message')
    if (message.kind === 'message') {
      expect(message.text).not.toContain('"type"')
      expect(message.text).not.toContain('"content"')
      expect(message.text).toContain('## Changes Summary')
      expect(message.text).toContain('shell-path.ts')
      expect(message.text).toContain('151 tests pass')
    }
  })

  it('real-world: preamble with buddy JSON that has actual newlines in raw text', () => {
    const rawText = '所有修改看起来都正确。现在我将输出伙伴协议消息。\n{"type": "chat", "content": "## Changes Summary\\n\\nFix 1: Kimi ENOENT error (original task)"}'
    const message = parseBuddyMessage(rawText)

    expect(message.kind).toBe('message')
    if (message.kind === 'message') {
      expect(message.text).not.toContain('"type"')
      expect(message.text).not.toContain('"content"')
      expect(message.text).toContain('## Changes Summary')
      expect(message.text).toContain('Kimi ENOENT')
    }
  })

  it('real-world: chinese preamble with buddy JSON, newlines escaped as literal backslash-n', () => {
    const rawText = '所有修改看起来都正确。现在我将输出伙伴协议消息。\\n\\n{\\"type\\": \\"chat\\", \\"content\\": \\"## Changes Summary\\n\\nFix 1: Kimi ENOENT error (original task)\\"}'
    const message = parseBuddyMessage(rawText)

    expect(message.kind).toBe('message')
    if (message.kind === 'message') {
      expect(message.text).not.toContain('"type"')
      expect(message.text).not.toContain('"content"')
      expect(message.text).toContain('## Changes Summary')
      expect(message.text).toContain('Kimi ENOENT')
    }
  })
})
