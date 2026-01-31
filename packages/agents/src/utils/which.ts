import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Find executable in PATH (cross-platform)
 */
export async function which(command: string): Promise<string | null> {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execAsync(`${cmd} ${command}`)
    return stdout.trim().split('\n')[0] || null
  } catch {
    return null
  }
}
