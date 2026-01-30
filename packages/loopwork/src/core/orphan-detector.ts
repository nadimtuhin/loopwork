import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { logger } from './utils'

export interface OrphanProcess {
  pid: number
  command: string
  age: number // ms since start
  memory: number // bytes
  cwd?: string
  classification: 'confirmed' | 'suspected'
  reason: string
}

export interface DetectorOptions {
  projectRoot: string
  patterns?: string[] // additional patterns
  maxAge?: number // only return processes older than this (ms)
}

interface TrackedPid {
  pid: number
  command: string
  spawnedAt: string
  cwd: string
}

interface TrackedPidsData {
  pids: TrackedPid[]
}

const DEFAULT_ORPHAN_PATTERNS = [
  'bun test',
  'tail -f',
  'zsh -c -l source.*shell-snapshots',
  'claude',
  'opencode',
]

/**
 * Get path to spawned PIDs tracking file
 */
function getTrackingFilePath(projectRoot: string): string {
  const stateDir = path.join(projectRoot, '.loopwork')
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true })
  }
  return path.join(stateDir, 'spawned-pids.json')
}

/**
 * Read tracked PIDs from file
 */
function readTrackedPids(projectRoot: string): TrackedPidsData {
  const filePath = getTrackingFilePath(projectRoot)
  if (!fs.existsSync(filePath)) {
    return { pids: [] }
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    logger.debug(`Failed to read tracked PIDs: ${error}`)
    return { pids: [] }
  }
}

/**
 * Write tracked PIDs to file
 */
function writeTrackedPids(projectRoot: string, data: TrackedPidsData): void {
  const filePath = getTrackingFilePath(projectRoot)
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
  } catch (error) {
    logger.debug(`Failed to write tracked PIDs: ${error}`)
  }
}

/**
 * Track a spawned PID
 */
export function trackSpawnedPid(pid: number, command: string, cwd: string): void {
  const projectRoot = cwd
  const data = readTrackedPids(projectRoot)

  // Avoid duplicates
  if (data.pids.some(p => p.pid === pid)) {
    return
  }

  data.pids.push({
    pid,
    command,
    spawnedAt: new Date().toISOString(),
    cwd,
  })

  writeTrackedPids(projectRoot, data)
}

/**
 * Untrack a PID (when process is cleaned up)
 */
export function untrackPid(pid: number): void {
  // Find which project root this PID belongs to by searching common locations
  const possibleRoots = [
    process.cwd(),
    path.resolve(process.cwd(), '../..'),
  ]

  for (const root of possibleRoots) {
    const data = readTrackedPids(root)
    const initialLength = data.pids.length
    data.pids = data.pids.filter(p => p.pid !== pid)

    if (data.pids.length < initialLength) {
      writeTrackedPids(root, data)
      return
    }
  }
}

/**
 * Get all tracked PIDs
 */
export function getTrackedPids(): TrackedPid[] {
  const projectRoot = process.cwd()
  const data = readTrackedPids(projectRoot)
  return data.pids
}

/**
 * Check if a process exists
 */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Get process info from ps
 */
interface ProcessInfo {
  pid: number
  ppid: number
  command: string
  elapsed: string // format: [[dd-]hh:]mm:ss
  rss: number // KB
}

function getProcessInfo(pid: number): ProcessInfo | null {
  try {
    // Use ps to get process details
    // -p PID: specific process
    // -o: output format (pid,ppid,command,etime,rss)
    const output = execSync(`ps -p ${pid} -o pid=,ppid=,command=,etime=,rss=`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim()

    if (!output) return null

    const parts = output.split(/\s+/)
    if (parts.length < 5) return null

    return {
      pid: parseInt(parts[0], 10),
      ppid: parseInt(parts[1], 10),
      command: parts.slice(2, -2).join(' '),
      elapsed: parts[parts.length - 2],
      rss: parseInt(parts[parts.length - 1], 10),
    }
  } catch {
    return null
  }
}

/**
 * Parse elapsed time string to milliseconds
 */
function parseElapsedTime(elapsed: string): number {
  // Format: [[dd-]hh:]mm:ss
  const parts = elapsed.split(/[-:]/).map(p => parseInt(p, 10))

  if (parts.length === 2) {
    // mm:ss
    return (parts[0] * 60 + parts[1]) * 1000
  } else if (parts.length === 3) {
    // hh:mm:ss
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
  } else if (parts.length === 4) {
    // dd-hh:mm:ss
    return (parts[0] * 86400 + parts[1] * 3600 + parts[2] * 60 + parts[3]) * 1000
  }

  return 0
}

/**
 * Get process working directory
 */
function getProcessCwd(pid: number): string | undefined {
  try {
    // Use lsof to get cwd
    const output = execSync(`lsof -a -p ${pid} -d cwd -Fn`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim()

    // Parse lsof output: lines starting with 'n' contain the path
    for (const line of output.split('\n')) {
      if (line.startsWith('n')) {
        return line.substring(1)
      }
    }
  } catch {
    // lsof may fail due to permissions
  }
  return undefined
}

/**
 * Check if a process is a descendant of loopwork
 */
function isLoopworkDescendant(pid: number): boolean {
  let currentPid = pid
  const visited = new Set<number>()

  while (currentPid > 1 && !visited.has(currentPid)) {
    visited.add(currentPid)

    const info = getProcessInfo(currentPid)
    if (!info) break

    // Check if this process is loopwork
    if (info.command.includes('loopwork') || info.command.includes('bun run')) {
      return true
    }

    currentPid = info.ppid
  }

  return false
}

/**
 * Find processes matching patterns
 */
function findMatchingProcesses(patterns: string[]): ProcessInfo[] {
  try {
    // Use ps to list all processes
    const output = execSync('ps aux', {
      encoding: 'utf-8',
      timeout: 10000,
    })

    const lines = output.split('\n').slice(1) // Skip header
    const matches: ProcessInfo[] = []

    for (const line of lines) {
      if (!line.trim()) continue

      // Parse ps aux output
      const parts = line.trim().split(/\s+/)
      if (parts.length < 11) continue

      const pid = parseInt(parts[1], 10)
      const _rss = parseInt(parts[5], 10)
      const command = parts.slice(10).join(' ')

      // Check if command matches any pattern
      const matchesPattern = patterns.some(pattern => {
        if (pattern.includes('.*')) {
          // Regex pattern
          const regex = new RegExp(pattern)
          return regex.test(command)
        } else {
          // Simple substring match
          return command.includes(pattern)
        }
      })

      if (matchesPattern) {
        const info = getProcessInfo(pid)
        if (info) {
          matches.push(info)
        }
      }
    }

    return matches
  } catch (error) {
    logger.debug(`Failed to find processes: ${error}`)
    return []
  }
}

/**
 * Detect orphan processes
 */
export async function detectOrphans(options: DetectorOptions): Promise<OrphanProcess[]> {
  const { projectRoot, patterns = [], maxAge = 0 } = options
  const allPatterns = [...DEFAULT_ORPHAN_PATTERNS, ...patterns]

  // Get tracked PIDs
  const tracked = readTrackedPids(projectRoot)
  const trackedPidSet = new Set(tracked.pids.map(p => p.pid))

  // Find matching processes
  const matches = findMatchingProcesses(allPatterns)
  const orphans: OrphanProcess[] = []

  for (const match of matches) {
    // Safety: skip system processes
    if (match.pid < 100) continue

    // Verify process still exists
    if (!processExists(match.pid)) continue

    // Parse age
    const age = parseElapsedTime(match.elapsed)

    // Apply age filter
    if (maxAge > 0 && age < maxAge) continue

    // Get process cwd
    const cwd = getProcessCwd(match.pid)

    // Classify process
    let classification: 'confirmed' | 'suspected'
    let reason: string

    if (trackedPidSet.has(match.pid)) {
      classification = 'confirmed'
      reason = 'Tracked by loopwork'
    } else if (cwd && cwd.startsWith(projectRoot)) {
      // Check if it's a loopwork descendant
      if (isLoopworkDescendant(match.pid)) {
        classification = 'confirmed'
        reason = 'Loopwork descendant process in project directory'
      } else {
        classification = 'suspected'
        reason = 'Matches pattern and runs in project directory but not tracked'
      }
    } else {
      classification = 'suspected'
      reason = 'Matches orphan pattern but cwd unknown or outside project'
    }

    orphans.push({
      pid: match.pid,
      command: match.command,
      age,
      memory: match.rss * 1024, // Convert KB to bytes
      cwd,
      classification,
      reason,
    })
  }

  // Clean up tracked PIDs that no longer exist
  const cleanedPids = tracked.pids.filter(p => processExists(p.pid))
  if (cleanedPids.length < tracked.pids.length) {
    writeTrackedPids(projectRoot, { pids: cleanedPids })
  }

  return orphans
}
