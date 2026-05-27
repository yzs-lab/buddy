import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, Theme } from '../hooks/useTheme'
import { useUpdateGlobalSettings } from '../hooks/useBuddy'
import { useLanguagePref, useSendShortcut, useT, TFunction } from '../hooks/useI18n'
import { LANGUAGE_OPTIONS, LanguagePref, SendShortcut } from '../lib/i18n'
import type { GlobalSettings, Launcher } from '../../shared/types'
import { DEFAULT_LAUNCHER_ORDER, defaultLauncherFor, normalizeGlobalSettings } from '../../shared/defaults'

export type SettingsTab = 'general' | 'appearance'

interface SettingsContentProps {
  tab: SettingsTab
  globalSettings: GlobalSettings | null
}

type LauncherInfo = { title: string; label: string; placeholder: string; hint: React.ReactNode }

function launcherInfoFor(actor: string, t: TFunction): LauncherInfo {
  switch (actor) {
    case 'claude':
      return {
        title: t('settings.launcher.claude.title'),
        label: t('settings.launcher.claude.label'),
        placeholder: 'claude --dangerously-skip-permissions',
        hint: <HintWithCode template={t('settings.launcher.claude.hint')} />
      }
    case 'codex':
      return {
        title: t('settings.launcher.codex.title'),
        label: t('settings.launcher.codex.label'),
        placeholder: 'codex',
        hint: <HintWithCode template={t('settings.launcher.codex.hint')} />
      }
    case 'opencode':
      return {
        title: t('settings.launcher.opencode.title'),
        label: t('settings.launcher.opencode.label'),
        placeholder: 'opencode',
        hint: <HintWithCode template={t('settings.launcher.opencode.hint')} />
      }
    case 'kimi':
      return {
        title: t('settings.launcher.kimi.title'),
        label: t('settings.launcher.kimi.label'),
        placeholder: 'kimi',
        hint: <HintWithCode template={t('settings.launcher.kimi.hint')} />
      }
    default:
      return { title: actor, label: actor, placeholder: actor, hint: '' }
  }
}

/**
 * Renders a hint string, wrapping CLI flags (tokens starting with `--` or `-` and option names like `exec`/`run`/`stream-json`)
 * in <code> tags only when they appear; here we just render plain text since we already pre-translated the hint.
 */
function HintWithCode({ template }: { template: string }) {
  return <>{template}</>
}

export function SettingsContent({ tab, globalSettings }: SettingsContentProps) {
  const t = useT()
  const pageTitle = tab === 'general' ? t('settings.tab.general') : t('settings.tab.appearance')
  return (
    <div className="flex-1 overflow-y-auto bg-bg-elevated">
      <div className="max-w-4xl mx-auto px-10 py-10">
        <h1 className="text-2xl font-semibold mb-8">{pageTitle}</h1>
        {tab === 'general' ? (
          <GeneralSettings globalSettings={globalSettings} />
        ) : (
          <AppearanceSettings />
        )}
      </div>
    </div>
  )
}

function GeneralSection() {
  const t = useT()
  const { pref, setPref, detected } = useLanguagePref()
  const { shortcut, setShortcut } = useSendShortcut()

  const detectedLabel = detected === 'zh-CN' ? '简体中文' : detected === 'zh-TW' ? '繁體中文' : 'English'
  const sendOptions: Array<{ value: SendShortcut; label: string; desc: string }> = [
    {
      value: 'shift-enter',
      label: t('settings.general.send.shiftEnter'),
      desc: t('settings.general.send.shiftEnterHint')
    },
    {
      value: 'enter',
      label: t('settings.general.send.enter'),
      desc: t('settings.general.send.enterHint')
    }
  ]

  return (
    <div>
      <h2 className="text-base font-semibold text-fg mb-1">{t('settings.general.section.title')}</h2>
      <p className="text-sm text-fg-secondary mb-5">{t('settings.general.section.desc')}</p>

      <SettingsList>
        <SettingsRow
          title={t('settings.general.language.title')}
          description={t('settings.general.language.desc')}
          right={
            <select
              value={pref}
              onChange={(e) => setPref(e.target.value as LanguagePref)}
              className="px-2 py-1 text-sm bg-bg border border-border rounded-md focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value === 'auto' ? `${opt.label} (${detectedLabel})` : opt.label}
                </option>
              ))}
            </select>
          }
        />

        <SettingsRow
          title={t('settings.general.send.title')}
          description={t('settings.general.send.desc')}
          right={
            <select
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value as SendShortcut)}
              className="px-2 py-1 text-sm bg-bg border border-border rounded-md focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {sendOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          }
        />
      </SettingsList>
    </div>
  )
}

function GeneralSettings({ globalSettings }: { globalSettings: GlobalSettings | null }) {
  const t = useT()
  const updateMutation = useUpdateGlobalSettings()
  const normalizedSettings = normalizeGlobalSettings(globalSettings)
  const launchers = normalizedSettings.launchers ?? {}

  const buildBase = (): GlobalSettings => normalizedSettings

  const save = (patch: Partial<GlobalSettings>) => {
    updateMutation.mutate({ ...buildBase(), ...patch })
  }

  const saveLauncher = (actor: string, patch: Partial<Launcher>) => {
    const cur = launchers[actor] ?? defaultLauncherFor(actor)
    const next = { ...cur, ...patch, env: cur.env }
    save({ launchers: { ...launchers, [actor]: next } })
  }

  const saveAllTimeouts = (timeout: number) => {
    const nextLaunchers: Record<string, Launcher> = {}
    for (const [actor, l] of Object.entries(launchers)) {
      nextLaunchers[actor] = { ...l, timeout_seconds: timeout, env: l.env }
    }
    save({ launchers: nextLaunchers })
  }

  const currentTimeout =
    DEFAULT_LAUNCHER_ORDER.map((a) => launchers[a]?.timeout_seconds).find((v) => typeof v === 'number') ?? 7200

  return (
    <div className="space-y-8">
      <GeneralSection />

      <div className="pt-2">
        <h2 className="text-base font-semibold text-fg mb-1">{t('settings.cli.title')}</h2>
        <p className="text-sm text-fg-secondary mb-5">{t('settings.cli.desc')}</p>
      </div>

      <SettingsList>
        {DEFAULT_LAUNCHER_ORDER.map((actor) => {
          const launcher = launchers[actor] ?? defaultLauncherFor(actor)
          return (
            <LauncherSection
              key={actor}
              actor={actor}
              launcher={launcher}
              info={launcherInfoFor(actor, t)}
              onSaveCommand={(command) => saveLauncher(actor, { command })}
            />
          )
        })}
      </SettingsList>

      <div className="pt-4">
        <h2 className="text-base font-semibold text-fg mb-1">{t('settings.collab.title')}</h2>
        <p className="text-sm text-fg-secondary mb-3">{t('settings.collab.desc')}</p>
        <SettingsList>
          <SettingsRow
            title={t('settings.collab.maxRounds.title')}
            description={t('settings.collab.maxRounds.desc')}
            right={
              <EditableNumber
                value={globalSettings?.max_rounds ?? 9999}
                min={-1}
                max={999999}
                onSave={(v) => save({ max_rounds: v })}
              />
            }
          />
          <SettingsRow
            title={t('settings.collab.timeout.title')}
            description={t('settings.collab.timeout.desc')}
            right={
              <EditableNumber
                value={currentTimeout}
                min={60}
                max={86400}
                onSave={saveAllTimeouts}
              />
            }
          />
        </SettingsList>
      </div>
    </div>
  )
}

function LauncherSection({ actor, launcher, info, onSaveCommand }: {
  actor: string
  launcher: Launcher
  info: LauncherInfo
  onSaveCommand: (command: string) => void
}) {
  const t = useT()
  const saved = launcher.command || ''
  const [draft, setDraft] = useState(saved)

  useEffect(() => {
    setDraft(saved)
  }, [saved])

  const dirty = draft !== saved

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 mb-1">
        <ActorBadge actor={actor} />
        <h2 className="text-base font-semibold text-fg">{info.title}</h2>
        <button
          type="button"
          onClick={() => onSaveCommand(draft)}
          disabled={!dirty}
          className="ml-auto px-3 py-1 text-xs font-medium rounded-md bg-accent text-fg-inverse hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t('common.save')}
        </button>
      </div>
      <p className="text-sm text-fg-secondary mb-3 leading-relaxed">{info.hint}</p>
      <div className="text-xs font-medium text-fg-secondary mb-1.5">{info.label}</div>
      <input
        type="text"
        value={draft}
        placeholder={info.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && dirty) {
            e.preventDefault()
            onSaveCommand(draft)
          }
          if (e.key === 'Escape') {
            setDraft(saved)
          }
        }}
        className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-lg font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
      />
      {Object.keys(launcher.env).length > 0 && (
        <div className="mt-2 text-xs text-fg-muted font-mono">
          {Object.entries(launcher.env).map(([k, v]) => (
            <div key={k}>{k}={v}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function AppearanceSettings() {
  const t = useT()
  const { theme, setTheme } = useTheme()

  const themeOptions: { value: Theme; label: string; description: string }[] = [
    { value: 'light', label: t('settings.appearance.theme.light.label'), description: t('settings.appearance.theme.light.desc') },
    { value: 'dark', label: t('settings.appearance.theme.dark.label'), description: t('settings.appearance.theme.dark.desc') },
    { value: 'system', label: t('settings.appearance.theme.system.label'), description: t('settings.appearance.theme.system.desc') },
  ]

  return (
    <div className="space-y-10">
      <SettingsSection title={t('settings.appearance.theme.title')} description={t('settings.appearance.theme.desc')}>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((opt) => {
            const active = theme === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`relative p-4 rounded-xl border bg-bg-elevated text-left transition-colors ${
                  active
                    ? 'border-accent ring-1 ring-accent'
                    : 'border-border hover:border-fg-muted'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ThemeIcon theme={opt.value} active={active} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </div>
                <div className="text-xs text-fg-muted">{opt.description}</div>
                <div
                  className={`absolute top-3 right-3 w-4 h-4 rounded-full border-2 ${
                    active ? 'border-accent bg-accent' : 'border-border'
                  }`}
                >
                  {active && (
                    <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-fg-inverse" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </SettingsSection>
    </div>
  )
}

function ThemeIcon({ theme, active }: { theme: Theme; active: boolean }) {
  const color = active ? 'var(--accent)' : 'var(--fg-muted)'
  if (theme === 'light') {
    return <Sun size={16} color={color} strokeWidth={2} />
  }
  if (theme === 'dark') {
    return <Moon size={16} color={color} strokeWidth={2} />
  }
  return <Monitor size={16} color={color} strokeWidth={2} />
}

function SettingsSection({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-3">
        <div className="text-base font-semibold text-fg">{title}</div>
        {description && (
          <div className="text-sm text-fg-secondary mt-1">{description}</div>
        )}
      </div>
      {children}
    </div>
  )
}

function SettingsList({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated divide-y divide-border-subtle overflow-hidden">
      {children}
    </div>
  )
}

function SettingsRow({ title, description, right }: {
  title: string
  description?: string
  right: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-fg">{title}</div>
        {description && (
          <div className="text-xs text-fg-muted mt-0.5">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">{right}</div>
    </div>
  )
}

function EditableNumber({ value, min, max, onSave }: {
  value: number
  min: number
  max: number
  onSave: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = () => {
    const parsed = Number(draft)
    const clamped = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : value))
    if (clamped !== value) onSave(clamped)
    setDraft(String(clamped))
  }

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(String(value))
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className="w-20 px-2 py-1 text-sm text-fg font-mono text-right bg-transparent border border-transparent hover:border-border focus:border-accent focus:bg-bg rounded outline-none transition-colors"
    />
  )
}

function ActorBadge({ actor }: { actor: string }) {
  const colors: Record<string, string> = {
    claude: '#8b6dba',
    codex: '#4a9bb5',
    opencode: '#d97706',
    kimi: '#2e7d32',
  }
  const color = colors[actor] ?? 'var(--fg-muted)'
  return (
    <div
      className="w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}
