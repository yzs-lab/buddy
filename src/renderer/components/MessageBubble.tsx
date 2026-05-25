import { TranscriptEntry } from '../../shared/types'

interface MessageBubbleProps {
  entry: TranscriptEntry
}

export function MessageBubble({ entry }: MessageBubbleProps) {
  const isUser = entry.role === 'human'
  const isSystem = entry.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          {entry.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : ''}`}>
        <div className={`text-xs text-gray-500 mb-1 ${isUser ? 'text-right' : ''}`}>
          {formatRole(entry.role)}
          {entry.ts && (
            <span className="ml-2">
              {new Date(entry.ts).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}
        </div>

        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-accent-green text-white rounded-br-md'
              : 'bg-white border border-gray-200 rounded-bl-md'
          }`}
        >
          <div className="text-sm whitespace-pre-wrap">{entry.content}</div>
        </div>
      </div>
    </div>
  )
}

function formatRole(role: string): string {
  const roleMap: Record<string, string> = {
    human: '你',
    claude: 'Claude',
    codex: 'Codex',
    opencode: 'OpenCode',
    kimi: 'Kimi'
  }
  return roleMap[role] || role
}
