import { TranscriptEntry } from '../../shared/types'
import { renderMarkdown } from '../lib/markdown'
import { formatDuration, formatTime, decodeErrorText, ACTOR_LABEL_KEY } from '../lib/format'
import { useLanguage, useT } from '../hooks/useI18n'

interface MessageBubbleProps {
  entry: TranscriptEntry
}

const roleClasses: Record<string, string> = {
  human: 'msg-human',
  claude: 'msg-claude',
  codex: 'msg-codex',
  opencode: 'msg-opencode',
  kimi: 'msg-kimi',
  system: 'msg-system'
}

export function MessageBubble({ entry }: MessageBubbleProps) {
  const t = useT()
  const lang = useLanguage()
  const isSystem = entry.role === 'system'
  const isHuman = entry.role === 'human'
  const meta = entry.meta || ({} as Record<string, unknown>)
  const isRoundNotice = isSystem && meta.kind === 'round_notice'

  const bodyText = isSystem && !isRoundNotice ? decodeErrorText(entry.content) : entry.content
  const html = renderMarkdown(bodyText)
  const cls = roleClasses[entry.role] || 'msg-default'
  const metaText = formatMessageMeta(entry, lang)

  const roleLabel = isRoundNotice
    ? t('actor.systemNotice')
    : ACTOR_LABEL_KEY[entry.role]
      ? t(ACTOR_LABEL_KEY[entry.role])
      : entry.role

  return (
    <div className={`flex mb-3 ${isHuman ? 'justify-end' : 'justify-start'}`}>
      <div className={`message ${cls} ${isRoundNotice ? 'round-notice' : ''} ${isHuman ? 'min-w-[66.666667%] max-w-[82%]' : 'w-full'}`}>
        <div className="message-head">
          <span className="role">{roleLabel}</span>
          {metaText && <span>{metaText}</span>}
        </div>
        <div
          className="message-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

function formatMessageMeta(entry: TranscriptEntry, lang: ReturnType<typeof useLanguage>): string {
  const meta = entry.meta || ({} as Record<string, unknown>)
  const parts: string[] = []
  const round = meta.round as number | undefined
  const elapsedMs = meta.elapsed_ms as number | null | undefined
  const isRoundNotice = entry.role === 'system' && meta.kind === 'round_notice'
  if (round && !isRoundNotice) {
    const roundLabel =
      lang === 'en' ? `Round ${round}`
        : lang === 'zh-TW' ? `第 ${round} 輪`
          : `第 ${round} 轮`
    parts.push(roundLabel)
  }
  if (elapsedMs != null) parts.push(formatDuration(elapsedMs))
  if (entry.ts) parts.push(formatTime(entry.ts, lang))
  return parts.join(' · ')
}
