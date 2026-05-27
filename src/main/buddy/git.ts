import { spawn } from 'node:child_process'
import { once } from 'node:events'
import type { GitDiffStats, GitRemote, GitStatusResult } from '../../shared/types'

export type { GitDiffStats, GitRemote, GitStatusResult }

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.stderr.on('data', (c: Buffer) => errChunks.push(c))
    once(child, 'exit').then((args: unknown[]) => {
      const code = args[0] as number | null
      const stdout = Buffer.concat(chunks).toString('utf8').trim()
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8').trim()
        reject(new Error(stderr || `git ${args.join(' ')} exited with ${code}`))
      } else {
        resolve(stdout)
      }
    }).catch(reject)
  })
}

function parseDiffStat(output: string): GitDiffStats | null {
  if (!output) return null
  let filesChanged = 0
  let insertions = 0
  let deletions = 0
  for (const line of output.split('\n')) {
    const m = line.match(/^(\d+)\s+(\d+)\s+/)
    if (m) {
      filesChanged++
      insertions += parseInt(m[1], 10)
      deletions += parseInt(m[2], 10)
    }
  }
  if (filesChanged === 0) return null
  return { filesChanged, insertions, deletions, summary: output }
}

export async function getGitBranch(cwd: string): Promise<string> {
  try {
    return await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  } catch {
    return ''
  }
}

export async function getGitDiffStats(cwd: string): Promise<GitDiffStats | null> {
  try {
    const output = await execGit(['diff', '--numstat'], cwd)
    return parseDiffStat(output)
  } catch {
    return null
  }
}

export async function getGitStagedStats(cwd: string): Promise<GitDiffStats | null> {
  try {
    const output = await execGit(['diff', '--cached', '--numstat'], cwd)
    return parseDiffStat(output)
  } catch {
    return null
  }
}

export async function getGitRemotes(cwd: string): Promise<GitRemote[]> {
  try {
    const output = await execGit(['remote', '-v'], cwd)
    const remotes: GitRemote[] = []
    const seen = new Set<string>()
    for (const line of output.split('\n')) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)/)
      if (match && !seen.has(match[1])) {
        seen.add(match[1])
        remotes.push({ name: match[1], url: match[2] })
      }
    }
    return remotes
  } catch {
    return []
  }
}

export async function getGitStatus(cwd: string): Promise<GitStatusResult> {
  const [branch, diff, staged, remotes] = await Promise.all([
    getGitBranch(cwd),
    getGitDiffStats(cwd),
    getGitStagedStats(cwd),
    getGitRemotes(cwd)
  ])
  return { branch, diff, staged, remotes }
}

export async function gitStageAll(cwd: string): Promise<void> {
  await execGit(['add', '-A'], cwd)
}

export async function gitCommitAndPush(
  cwd: string,
  message: string,
  remote: string
): Promise<{ commitHash: string }> {
  await execGit(['commit', '-m', message], cwd)
  const commitHash = await execGit(['rev-parse', '--short', 'HEAD'], cwd)
  await execGit(['push', remote], cwd)
  return { commitHash }
}

export async function gitDiffForCommitMessage(cwd: string): Promise<string> {
  try {
    const [unstaged, staged, statusShort] = await Promise.all([
      execGit(['diff', '--stat'], cwd).catch(() => ''),
      execGit(['diff', '--cached', '--stat'], cwd).catch(() => ''),
      execGit(['status', '--short'], cwd).catch(() => '')
    ])
    return [
      '## git status --short',
      statusShort || '(clean)',
      '',
      '## unstaged diff stat',
      unstaged || '(none)',
      '',
      '## staged diff stat',
      staged || '(none)'
    ].join('\n')
  } catch {
    return ''
  }
}

export async function generateCommitMessage(cwd: string, actorCommand?: string): Promise<string> {
  const diffSummary = await gitDiffForCommitMessage(cwd)
  if (!diffSummary.trim()) return ''

  const command = actorCommand?.trim() || 'claude'
  const prompt = `Generate a concise git commit message for the following changes. Output ONLY the commit message text, no explanation, no quotes, no markdown.\n\n${diffSummary}`

  return new Promise((resolve) => {
    const child = spawn(command, ['-p', '--output-format', 'text', '--input-format', 'text'], {
      cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const chunks: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.stdin.end(prompt)

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      resolve('')
    }, 30000)

    once(child, 'exit').then(() => {
      clearTimeout(timeout)
      const text = Buffer.concat(chunks).toString('utf8').trim()
      resolve(text || '')
    }).catch(() => {
      clearTimeout(timeout)
      resolve('')
    })
  })
}
