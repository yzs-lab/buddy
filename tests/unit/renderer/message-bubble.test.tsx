// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageBubble } from '../../../src/renderer/components/MessageBubble'
import type { TranscriptEntry } from '../../../src/shared/types'

function transcriptEntry(role: TranscriptEntry['role'], content = 'Short message'): TranscriptEntry {
  return {
    role,
    content,
    ts: '2026-05-26T07:30:00.000Z'
  }
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText }
  })
  window.localStorage.setItem('buddy.language', 'en')
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('MessageBubble layout', () => {
  it('gives human message cards a minimum width of two thirds', () => {
    const html = renderToStaticMarkup(
      <MessageBubble entry={transcriptEntry('human')} />
    )

    expect(html).toContain('justify-end')
    expect(html).toContain('min-w-[66.666667%] max-w-[82%]')
  })

  it('keeps agent message cards full width', () => {
    const html = renderToStaticMarkup(
      <MessageBubble entry={transcriptEntry('codex')} />
    )

    expect(html).toContain('justify-start')
    expect(html).toContain('w-full')
    expect(html).not.toContain('min-w-[66.666667%]')
  })

  it('renders system messages as cards with the msg-system class', () => {
    const html = renderToStaticMarkup(
      <MessageBubble entry={transcriptEntry('system', 'codex run failed')} />
    )

    expect(html).toContain('msg-system')
    expect(html).toContain('w-full')
    expect(html).not.toContain('flex mb-3 justify-center')
    expect(html).not.toContain('rounded-full')
  })
})

describe('MessageBubble Markdown copy controls', () => {
  it('places copy icons at both right-side positions and copies the Markdown source', async () => {
    const markdown = '# Result\n\n- first\n- second\n\n```ts\nconst ready = true\n```'
    const { container } = render(
      <MessageBubble entry={transcriptEntry('codex', markdown)} />
    )

    const copyButtons = screen.getAllByRole('button', { name: 'Copy message as Markdown' })
    expect(copyButtons).toHaveLength(2)
    expect(copyButtons[0]).toHaveAttribute('data-copy-position', 'top')
    expect(copyButtons[0]).toHaveClass('cursor-pointer')
    expect(copyButtons[0].closest('.message-head')).not.toBeNull()
    expect(copyButtons[1]).toHaveAttribute('data-copy-position', 'bottom')
    expect(container.querySelector('.message > div:last-child')).toContainElement(copyButtons[1])

    fireEvent.click(copyButtons[0])

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(markdown))
    const copiedButtons = screen.getAllByRole('button', { name: 'Markdown copied' })
    expect(copiedButtons).toHaveLength(2)

    fireEvent.click(copiedButtons[1])
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    expect(writeText).toHaveBeenLastCalledWith(markdown)
  })
})
