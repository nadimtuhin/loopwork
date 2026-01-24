import chokidar from 'chokidar'
import path from 'path'
import fs from 'fs'
import type { DashboardBroadcaster } from './broadcaster'

let watcher: chokidar.FSWatcher | null = null

export function startFileWatcher(broadcaster: DashboardBroadcaster, watchDir: string = process.cwd()) {
  if (watcher) {
    return watcher
  }

  watcher = chokidar.watch('.loopwork-state*', {
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
