import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const STARTUP_FILES = ['.zshenv', '.zprofile', '.zshrc', '.bash_profile', '.bashrc', '.profile']

function unquoteShellValue(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function expandHome(value: string, home: string): string {
  return value.replace(/^~(?=$|\/)/, home).replace(/\$\{HOME\}|\$HOME/g, home)
}

export function readShellStartupEnvVar(name: string, home = process.env.HOME): string | undefined {
  if (!home || process.platform === 'win32') {
    return undefined
  }

  const assignment = new RegExp(`^(?:export\\s+)?${name}=([^#\\n]+)`)
  for (const file of STARTUP_FILES) {
    const path = join(home, file)
    if (!existsSync(path)) {
      continue
    }

    let content
    try {
      content = readFileSync(path, 'utf8')
    } catch {
      continue
    }

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      const match = assignment.exec(line)
      if (!match?.[1]) {
        continue
      }
      // Why: GUI-launched Orca does not inherit interactive shell exports, but
      // the PTY startup file will later re-export them and override our overlay.
      return expandHome(unquoteShellValue(match[1]), home)
    }
  }

  return undefined
}
