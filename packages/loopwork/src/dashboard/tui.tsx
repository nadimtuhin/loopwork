/**
 * Loopwork Dashboard
 *
 * Live TUI dashboard showing loop progress using ink (React for CLI).
 *
 * Usage:
 *   import { createDashboardPlugin, renderDashboard } from './dashboard'
 *
 *   // As a plugin
 *   withPlugin(createDashboardPlugin())
 *
 *   // Standalone
 *   renderDashboard()
 */

import React, { useState, useEffect } from 'react'
import { render, Box, Text, useApp, useInput } from 'ink'
import { ProgressBar as InkProgressBar } from '../components/ProgressBar'
import type { LoopworkPlugin } from '../contracts/plugin'

interface DashboardTask {
  id: string
  title: string
  status?: string
  priority?: string
}

interface TaskEvent {
  id: string
  title: string
  status: 'started' | 'completed' | 'failed'
  duration?: number
  error?: string
  timestamp: Date
}

interface DashboardState {
  namespace: string
  currentTask: DashboardTask | null
  pendingTasks: DashboardTask[]
  taskStartTime: number | null
  completed: number
  failed: number
  total: number
  loopStartTime: number | null
  recentEvents: TaskEvent[]
  isRunning: boolean
}

let dashboardState: DashboardState = {
  namespace: 'default',
  currentTask: null,
  pendingTasks: [],
  taskStartTime: null,
  completed: 0,
  failed: 0,
  total: 0,
  loopStartTime: null,
  recentEvents: [],
  isRunning: false,
}

let stateListeners: Array<(state: DashboardState) => void> = []

function updateState(updates: Partial<DashboardState>) {
  dashboardState = { ...dashboardState, ...updates }
  stateListeners.forEach((fn) => fn(dashboardState))
}

function subscribe(fn: (state: DashboardState) => void) {
  stateListeners.push(fn)
  return () => {
    stateListeners = stateListeners.filter((f) => f !== fn)
  }
}

function Header({ namespace }: { namespace: string }) {
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        {'🤖 Loopwork Dashboard'}
      </Text>
      <Text color="gray"> | </Text>
      <Text color="yellow">namespace: {namespace}</Text>
    </Box>
  )
}

function CurrentTask({ task, startTime }: { task: DashboardTask | null; startTime: number | null }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startTime) {
      setElapsed(0)
      return
    }

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  if (!task) {
    return (
      <Box marginY={1}>
        <Text color="gray">⏳ Waiting for next task...</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="cyan">{'▶ '}</Text>
        <Text bold>{task.id}</Text>
        <Text color="gray">: {task.title.slice(0, 50)}</Text>
      </Box>
      <Box>
        <Text color="yellow">  ⏱ {formatTime(elapsed)}</Text>
      </Box>
    </Box>
  )
}

export function PendingTasks({ tasks, total }: { tasks: DashboardTask[]; total: number }) {
  if (total === 0) return null

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="white">Next Up:</Text>
      {tasks.length > 0 ? (
        // Render detailed list if available
        <Box flexDirection="column">
          {tasks.slice(0, 3).map((t, i) => (
            <Text key={i} color="gray">  ○ {t.id}: {t.title}</Text>
          ))}
          {tasks.length > 3 && <Text color="gray">  ... and {tasks.length - 3} more</Text>}
        </Box>
      ) : (
        <Text color="gray">  {total} tasks pending</Text>
      )}
    </Box>
  )
}

function Stats({ completed, failed, total }: { completed: number; failed: number; total: number }) {
  const pending = total - completed - failed
  
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="green">✓ {completed}</Text>
        <Text color="gray"> | </Text>
        <Text color="red">✗ {failed}</Text>
        <Text color="gray"> | </Text>
        <Text color="blue">○ {pending}</Text>
        <Text color="gray"> | </Text>
        <Text>Total: {total}</Text>
      </Box>
      <Box marginTop={1}>
        <InkProgressBar current={completed + failed} total={total} width={30} />
      </Box>
    </Box>
  )
}

function RecentEvents({ events }: { events: TaskEvent[] }) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="white">Recent:</Text>
      {events.length === 0 ? (
        <Text color="gray">  No events yet</Text>
      ) : (
        events.slice(-5).map((event, i) => (
          <Box key={i}>
            <Text color="gray">{formatTimestamp(event.timestamp)} </Text>
            <Text color={event.status === 'completed' ? 'green' : event.status === 'failed' ? 'red' : 'cyan'}>
              {event.status === 'completed' ? '✓' : event.status === 'failed' ? '✗' : '▶'}
            </Text>
            <Text> {event.id}</Text>
            {event.duration && <Text color="gray"> ({event.duration}s)</Text>}
          </Box>
        ))
      )}
    </Box>
  )
}

function ElapsedTime({ startTime }: { startTime: number | null }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startTime) return

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  if (!startTime) return null

  return (
    <Box>
      <Text color="gray">Loop time: </Text>
      <Text color="white">{formatTime(elapsed)}</Text>
    </Box>
  )
}

function Footer() {
  return (
    <Box marginTop={1}>
      <Text color="gray">Press </Text>
      <Text color="yellow">q</Text>
      <Text color="gray"> to quit</Text>
    </Box>
  )
}

function Dashboard() {
  const { exit } = useApp()
  const [state, setState] = useState<DashboardState>(dashboardState)

  useEffect(() => {
    return subscribe(setState)
  }, [])

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') {
      exit()
    }
    if (key.ctrl && input === 'c') {
      exit()
    }
  })

  // Calculate pending from total and completed/failed if pendingTasks is empty
  const pendingCount = state.total - state.completed - state.failed

  return (
    <Box flexDirection="column" padding={1}>
      <Header namespace={state.namespace} />

      <Box marginTop={1}>
        <ElapsedTime startTime={state.loopStartTime} />
      </Box>

      <CurrentTask task={state.currentTask} startTime={state.taskStartTime} />

      <Stats completed={state.completed} failed={state.failed} total={state.total} />

      <PendingTasks tasks={state.pendingTasks} total={pendingCount} />

      <RecentEvents events={state.recentEvents} />

      <Footer />
    </Box>
  )
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false })
}

/**
 * Render the dashboard (standalone mode)
 * Returns a Promise that resolves when the dashboard is closed
 */
export function renderDashboard(): Promise<void> {
  return new Promise((resolve) => {
    const { unmount, waitUntilExit } = render(<Dashboard />)

    waitUntilExit().then(() => {
      unmount()
      resolve()
    })
  })
}

/**
 * Create dashboard plugin
 */
export function createDashboardPlugin(options: { totalTasks?: number } = {}): LoopworkPlugin {
  return {
    name: 'dashboard',

    onLoopStart(namespace) {
      updateState({
        namespace,
        loopStartTime: Date.now(),
        isRunning: true,
        completed: 0,
        failed: 0,
        total: options.totalTasks || 0,
        recentEvents: [],
      })
    },

    onTaskStart(context) {
      updateState({
        currentTask: { id: context.task.id, title: context.task.title },
        taskStartTime: Date.now(),
      })

      const events = [...dashboardState.recentEvents]
      events.push({
        id: context.task.id,
        title: context.task.title,
        status: 'started',
        timestamp: new Date(),
      })
      updateState({ recentEvents: events.slice(-10) })
    },

    onTaskComplete(context, result) {
      const { task } = context
      const events = [...dashboardState.recentEvents]
      const idx = events.findIndex((e) => e.id === task.id && e.status === 'started')
      if (idx >= 0) {
        events[idx] = {
          ...events[idx],
          status: 'completed',
          duration: Math.round(result.duration),
        }
      }

      updateState({
        currentTask: null,
        taskStartTime: null,
        completed: dashboardState.completed + 1,
        recentEvents: events.slice(-10),
      })
    },

    onTaskFailed(context, error) {
      const { task } = context
      const events = [...dashboardState.recentEvents]
      const idx = events.findIndex((e) => e.id === task.id && e.status === 'started')
      if (idx >= 0) {
        events[idx] = {
          ...events[idx],
          status: 'failed',
          error,
        }
      }

      updateState({
        currentTask: null,
        taskStartTime: null,
        failed: dashboardState.failed + 1,
        recentEvents: events.slice(-10),
      })
    },

    onLoopEnd() {
      updateState({
        isRunning: false,
        currentTask: null,
        taskStartTime: null,
      })
    },
  }
}

/**
 * Set total task count (call before loop starts)
 */
export function setTotalTasks(count: number) {
  updateState({ total: count })
}

/**
 * Get current dashboard state
 */
export function getDashboardState(): DashboardState {
  return { ...dashboardState }
}

/**
 * Start Ink TUI with dynamic data sources
 */
export async function startInkTui(options: {
  port?: number
  watch?: boolean
  directMode?: boolean
  getState?: () => Promise<{
    currentTask: { id: string; title: string; startedAt?: Date } | null
    pendingTasks: unknown[]
    completedTasks: Array<{ id: string; title: string }>
    failedTasks: Array<{ id: string; title: string }>
    stats: {
      total: number
      pending: number
      completed: number
      failed: number
    }
    recentEvents: Array<{
      id: string
      title: string
      status: 'started' | 'completed' | 'failed'
      timestamp: Date
    }>
  }>
  getRunningLoops?: () => Promise<Array<{
    namespace: string
    pid: number
    startTime: Date
  }>>
  getNamespaces?: () => Promise<string[]>
}): Promise<void> {
  if (options.getState) {
    const state = await options.getState()
    updateState({
      currentTask: state.currentTask ? {
        id: state.currentTask.id,
        title: state.currentTask.title,
        status: 'pending',
        priority: 'medium',
        } : null,
        pendingTasks: state.pendingTasks as any,
        completed: state.stats.completed,
      failed: state.stats.failed,
      total: state.stats.total,
      recentEvents: state.recentEvents.map(e => ({
        ...e,
        timestamp: e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp),
      })),
    })
  }

  if (options.getNamespaces) {
    const namespaces = await options.getNamespaces()
    if (namespaces.length > 0) {
      updateState({ namespace: namespaces[0] })
    }
  }

  let interval: NodeJS.Timeout | undefined
  if (options.watch && options.getState) {
    interval = setInterval(async () => {
      const state = await options.getState!()
      updateState({
        currentTask: state.currentTask ? {
          id: state.currentTask.id,
          title: state.currentTask.title,
          status: 'pending',
          priority: 'medium',
        } : null,
        pendingTasks: state.pendingTasks as any,
        completed: state.stats.completed,
        failed: state.stats.failed,
        total: state.stats.total,
        recentEvents: state.recentEvents.map(e => ({
          ...e,
          timestamp: e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp),
        })),
      })
    }, 1000)
  }

  const handleSigInt = () => {
    if (interval) clearInterval(interval)
    process.exit(0)
  }
  process.on('SIGINT', handleSigInt)

  try {
    await renderDashboard()
  } finally {
    if (interval) clearInterval(interval)
    process.off('SIGINT', handleSigInt)
  }
}
