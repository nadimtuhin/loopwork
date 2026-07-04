import React, { useState, useEffect } from 'react'
import { Box, Text, useApp, useInput, Static } from 'ink'
import { ProgressBar } from './ProgressBar'
import { InkBanner } from './InkBanner'
import { ThemeProvider } from '../theme/theme'
import { StatusBar } from './StatusBar'

export interface LogLine {
  id: number
  timestamp: string
  level: string
  message: string
  color: string
}

export interface TaskInfo {
  id: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startTime?: number
  duration?: number
  error?: string
}

export interface InkAppState {
  logs: LogLine[]
  currentTask: TaskInfo | null
  tasks: TaskInfo[]
  stats: {
    completed: number
    failed: number
    total: number
  }
  loopStartTime: number | null
  progressMessage: string | null
  progressPercent: number | null
  namespace: string
  iteration: number
  maxIterations: number
  layout: 'fullscreen' | 'inline'
  // Worker status
  workerStatus: {
    totalWorkers: number
    activeWorkers: number
    pendingTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
  }
  // View state
  logScrollOffset: number
}

export interface InkAppProps {
  initialState: InkAppState
  subscribe: (callback: (state: InkAppState) => void) => () => void
  onExit?: () => void
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const InnerInkApp: React.FC<InkAppProps> = ({ initialState, subscribe, onExit }) => {
  const { exit } = useApp()
  const [state, setState] = useState<InkAppState>({ ...initialState, logScrollOffset: 0 })
  const [showLogs, setShowLogs] = useState(true)
  const [scrollOffset, setScrollOffset] = useState(0)

  useEffect(() => {
    return subscribe((newState) => {
      setState(prev => ({ ...newState, logScrollOffset: prev.logScrollOffset }))
    })
  }, [subscribe])

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') {
      onExit?.()
      exit()
    }
    if (key.ctrl && input === 'c') {
      onExit?.()
      exit()
    }
    if (input === 'v') {
      setShowLogs(prev => !prev)
    }
    
    if (showLogs) {
      if (key.upArrow) {
        setScrollOffset(prev => Math.min(prev + 1, Math.max(0, state.logs.length - 20)))
      }
      if (key.downArrow) {
        setScrollOffset(prev => Math.max(prev - 1, 0))
      }
      if (key.pageUp) {
        setScrollOffset(prev => Math.min(prev + 10, Math.max(0, state.logs.length - 20)))
      }
      if (key.pageDown) {
        setScrollOffset(prev => Math.max(prev - 10, 0))
      }
    }
  })

  const elapsed = state.loopStartTime
    ? Math.floor((Date.now() - state.loopStartTime) / 1000)
    : 0

  const currentTaskElapsed = state.currentTask?.startTime
    ? Math.floor((Date.now() - state.currentTask.startTime) / 1000)
    : 0

  const isFullscreen = state.layout === 'fullscreen'

  const getVisibleLogs = () => {
    const visibleCount = 20
    const totalLogs = state.logs.length
    
    if (scrollOffset === 0) {
      return state.logs.slice(-visibleCount)
    }
    
    const end = totalLogs - scrollOffset
    const start = Math.max(0, end - visibleCount)
    return state.logs.slice(start, end)
  }

  if (isFullscreen) {
    return (
      <Box flexDirection="column" height="100%">
        <InkBanner 
          title="Loopwork Dashboard" 
          rows={[
            { key: 'Namespace', value: state.namespace },
            { key: 'Elapsed', value: formatTime(elapsed) }
          ]}
        />
        
        <Box flexDirection="row" flexGrow={1}>
           <Box flexDirection="column" width="30%" borderStyle="single" borderColor="gray" paddingX={1}>
              <Box flexDirection="column" marginY={1}>
                <Text bold color="white" underline>Status</Text>
                <Box marginTop={1}>
                   <Text color="green">✓ {state.stats.completed}</Text>
                   <Text color="gray"> | </Text>
                   <Text color="red">✗ {state.stats.failed}</Text>
                   <Text color="gray"> | </Text>
                   <Text>Total: {state.stats.total}</Text>
                </Box>
                {state.stats.total > 0 && (
                  <Box marginTop={1}>
                    <ProgressBar
                      current={state.stats.completed + state.stats.failed}
                      total={state.stats.total}
                      width={20}
                    />
                  </Box>
                )}
              </Box>

              {state.currentTask && (
                <Box flexDirection="column" marginY={1} borderStyle="round" borderColor="cyan" padding={1}>
                  <Text bold color="cyan">Current Task</Text>
                  <Text>{state.currentTask.id}</Text>
                  <Text color="gray">{state.currentTask.title.slice(0, 30)}...</Text>
                  <Text color="yellow">⏱ {formatTime(currentTaskElapsed)}</Text>
                  {state.progressMessage && (
                    <Box marginTop={1}>
                      <ProgressBar
                        message={state.progressMessage}
                        current={state.progressPercent ?? 0}
                        total={100}
                        indeterminate={state.progressPercent === null}
                        width={20}
                      />
                    </Box>
                  )}
                </Box>
              )}
           </Box>

           <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold underline>Logs (Press 'v' to toggle, arrows to scroll)</Text>
                {scrollOffset > 0 && <Text color="yellow">SCROLLED UP ({scrollOffset})</Text>}
              </Box>
              
              {showLogs && (
                 <Box flexDirection="column" overflowY="hidden">
                    {getVisibleLogs().map((log) => (
                      <Box key={log.id}>
                        <Text color="gray">{log.timestamp} </Text>
                        <Text color={log.color}>{log.level.toUpperCase()}</Text>
                        <Text>: {log.message}</Text>
                      </Box>
                    ))}
                 </Box>
              )}
           </Box>
        </Box>

        <StatusBar workerStatus={state.workerStatus} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          {'🤖 Loopwork'}
        </Text>
        <Text color="gray"> | </Text>
        <Text color="yellow">{state.namespace}</Text>
        <Text color="gray"> | </Text>
        <Text color="white">{formatTime(elapsed)}</Text>
      </Box>

      {state.currentTask && (
        <Box flexDirection="column" marginY={1}>
          <Box>
            <Text color="cyan">{'▶ '}</Text>
            <Text bold>{state.currentTask.id}</Text>
            <Text color="gray">: {state.currentTask.title.slice(0, 50)}</Text>
          </Box>
          <Box>
            <Text color="yellow">{'  ⏱ '}{formatTime(currentTaskElapsed)}</Text>
          </Box>
        </Box>
      )}

      {state.progressMessage && (
        <Box marginY={1}>
          <ProgressBar
            message={state.progressMessage}
            current={state.progressPercent ?? 0}
            total={100}
            indeterminate={state.progressPercent === null}
            width={30}
          />
        </Box>
      )}

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Static items={state.logs.slice(-10)}>
          {(log) => (
            <Box key={log.id}>
              <Text color="gray">{log.timestamp} </Text>
              <Text color={log.color}>{log.level.toUpperCase()}</Text>
              <Text>: {log.message}</Text>
            </Box>
          )}
        </Static>
      </Box>

      <Box marginTop={1}>
         <Text color="green">✓ {state.stats.completed}</Text>
         <Text color="gray"> | </Text>
         <Text color="red">✗ {state.stats.failed}</Text>
         <Text color="gray"> | </Text>
         <Text>Total: {state.stats.total}</Text>
         <Text color="gray"> | </Text>
         <Text color="blue">Workers: {state.workerStatus.activeWorkers}/{state.workerStatus.totalWorkers}</Text>
      </Box>
    </Box>
  )
}

export const InkApp: React.FC<InkAppProps> = (props) => (
  <ThemeProvider>
    <InnerInkApp {...props} />
  </ThemeProvider>
)
