import { useEffect, useRef } from 'react'
import { TaskDetail } from '../../shared/types'
import { MessageBubble } from './MessageBubble'
import { Composer } from './Composer'

interface ChatAreaProps {
  task: TaskDetail | null
  onSendMessage: (message: string) => void
  onStartTask: () => void
}

export function ChatArea({ task, onSendMessage, onStartTask }: ChatAreaProps) {
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [task?.transcript])

  const isRunning = task?.state?.status?.startsWith('RUNNING_') ?? false
  const isReady = task?.state?.status === 'READY' && (task?.state?.round ?? 0) === 0

  return (
    <div className="flex-1 flex flex-col bg-canvas min-w-0">
      {task?.workspace_key && (
        <div className="px-6 py-2 bg-white border-b border-gray-200">
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {task.workspace_key}
          </span>
        </div>
      )}

      <div ref={transcriptRef} className="flex-1 overflow-y-auto px-6 py-4">
        {!task ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <div className="text-lg font-medium mb-2">选择或创建一个任务</div>
              <div className="text-sm">在左侧栏选择任务，或创建新任务开始</div>
            </div>
          </div>
        ) : task.transcript.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <div className="text-lg font-medium mb-2">任务已创建</div>
              <div className="text-sm">点击下方"开始"让 AI 开始工作</div>
            </div>
          </div>
        ) : (
          task.transcript.map((entry, index) => (
            <MessageBubble key={index} entry={entry} />
          ))
        )}
      </div>

      <Composer
        onSend={onSendMessage}
        onStart={onStartTask}
        isRunning={isRunning}
        isReady={isReady}
      />
    </div>
  )
}
