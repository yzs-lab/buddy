import { useState, useRef, useEffect } from 'react'

interface ComposerProps {
  onSend: (message: string) => void
  onStart: () => void
  isRunning: boolean
  isReady: boolean
}

export function Composer({ onSend, onStart, isRunning, isReady }: ComposerProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [message])

  const handleSend = () => {
    if (message.trim()) {
      onSend(message.trim())
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <div className="flex gap-3">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a task..."
          className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:border-accent-green focus:ring-1 focus:ring-accent-green"
          rows={1}
          disabled={isRunning}
        />

        {isReady && !message.trim() ? (
          <button
            onClick={onStart}
            className="px-6 py-3 bg-accent-green text-white rounded-xl hover:bg-brand-green transition-colors self-end"
          >
            开始
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!message.trim() || isRunning}
            className="px-6 py-3 bg-accent-green text-white rounded-xl hover:bg-brand-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}
