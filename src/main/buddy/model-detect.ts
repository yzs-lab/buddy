import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Detect the current model for an actor by reading its configuration file.
 * This serves as a fallback when the model cannot be determined from
 * streaming output events.
 *
 * Config file locations:
 * - opencode: ~/.config/opencode/opencode.json  → JSON "model" field
 * - codex:    ~/.codex/config.toml              → TOML "model" field
 * - kimi:     ~/.kimi/config.toml               → TOML "default_model" field
 * - claude:   not needed (model reliably emitted in stream-json output)
 */
export async function detectModelFromConfig(actor: string): Promise<string | undefined> {
  try {
    const home = homedir()
    if (actor === 'opencode') {
      return await readJsonModel(join(home, '.config', 'opencode', 'opencode.json'), 'model')
    }
    if (actor === 'codex') {
      return await readTomlModel(join(home, '.codex', 'config.toml'), 'model')
    }
    if (actor === 'kimi') {
      return await readTomlModel(join(home, '.kimi', 'config.toml'), 'default_model')
    }
  } catch {
    // Config file may not exist or be unreadable — that's fine
  }
  return undefined
}

/**
 * Read a model field from a JSON config file.
 */
async function readJsonModel(filePath: string, field: string): Promise<string | undefined> {
  const raw = await readFile(filePath, 'utf8')
  const obj = JSON.parse(raw) as Record<string, unknown>
  const value = obj[field]
  return typeof value === 'string' && value ? value : undefined
}

/**
 * Extract a top-level string field from a TOML config file.
 * Uses a simple regex instead of a full TOML parser since we only
 * need a single top-level key.
 *
 * Handles: key = "value", key = 'value', key = value
 */
async function readTomlModel(filePath: string, field: string): Promise<string | undefined> {
  const raw = await readFile(filePath, 'utf8')
  // Match top-level field only: no leading whitespace, no dot in key path
  // Patterns: model = "gpt-5.5" | model = 'gpt-5.5' | model = gpt-5.5
  const re = new RegExp(`^${field}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(\\S+))`, 'm')
  const match = re.exec(raw)
  if (!match) return undefined
  const value = match[1] ?? match[2] ?? match[3]
  return value?.trim() || undefined
}
