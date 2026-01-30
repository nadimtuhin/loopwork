import chokidar from 'chokidar'
import path from 'path'
import fs from 'fs'
import type { DashboardBroadcaster } from './broadcaster'

// Local definition to avoid cross-package import issues
const LOOPWORK_DIR = '.loopwork'
const STATE_WATCH_PATTERNS = [
  `${LOOPWORK_DIR}/state*.json`,
  `${LOOPWORK_DIR}/monitor-state.json`,
  `${LOOPWORK_DIR}/ai-monitor`,
  `${LOOPWORK_DIR}/spawned-pids.json`,
  `${LOOPWORK_DIR}/parallel*.json`,
]

let watcher: chokidar.FSWatcher | null = null

export function startFileWatcher(broadcaster: DashboardBroadcaster, watchDir: string = process.cwd()) {
  if (watcher) {
    return watcher
  }

  watcher = chokidar.watch(STATE_WATCH_PATTERNS, {
    cwd: watchDir,
    ignoreInitial: false,
    persistent: true,
  })

  const broadcastUpdate = (filePath: string) => {
    try {
      const fullPath = path.resolve(watchDir, filePath)
      if (!fs.existsSync(fullPath)) return

      const content = fs.readFileSync(fullPath, 'utf-8')
      let stateData: any = content

      try {
        stateData = JSON.parse(content)
      } catch {
      }

      broadcaster.broadcast({
        type: 'state_update',
        namespace: 'system',
        timestamp: new Date().toISOString(),
        data: {
          file: filePath,
          state: stateData,
        },
      })
    } catch (err) {
      console.error(`[Dashboard] Error reading state file ${filePath}:`, err)
    }
  }

  watcher
    .on('add', (filePath) => broadcastUpdate(filePath))
    .on('change', (filePath) => broadcastUpdate(filePath))

  return watcher
}

export async function stopFileWatcher() {
  if (watcher) {
    await watcher.close()
    watcher = null
  }
}
