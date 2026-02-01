import React, { useState, useEffect } from 'react'
import { Box, Text, useApp, useInput, Static } from 'ink'
import { ProgressBar } from '../components/ProgressBar'
import { InkBanner } from '../components/InkBanner'

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

/**
 * Status Bar Component - Sticky at bottom showing worker/task stats
 */
const StatusBar: React.FC<{ workerStatus: InkAppState['workerStatus'] }> = ({ workerStatus }) => {
  const { 
    totalWorkers, 
    activeWorkers, 
    pendingTasks, 
    runningTasks, 
    completedTasks, 
    failedTasks 
  } = workerStatus

  return (
    <Box 
      flexDirection="row" 
      borderStyle="single" 
      borderColor="blue" 
      paddingX={1}
      backgroundColor="blue"
    >
      {/* Workers section */}
      <Box marginRight={2}>
        <Text color="white" bold>Workers:</Text>
        <Text color="yellow"> {activeWorkers}</Text>
        <Text color="gray">/</Text>
        <Text color="white">{totalWorkers}</Text>
      </Box>

      <Text color="gray">|</Text>

      {/* Tasks section */}
      <Box marginLeft={2} marginRight={2}>
        <Text color="white" bold>Tasks:</Text>
        <Text color="cyan"> {pendingTasks}</Text>
        <Text color="gray"> pending</Text>
        <Text color="gray"> · </Text>
        <Text color="yellow">{runningTasks}</Text>
        <Text color="gray"> running</Text>
        <Text color="gray"> · </Text>
        <Text color="green">{completedTasks}</Text>
        <Text color="gray"> done</Text>
        {failedTasks > 0 && (
          <>
            <Text color="gray"> · </Text>
            <Text color="red">{failedTasks}</Text>
            <Text color="gray"> failed</Text>
          </>
        )}
      </Box>
    </Box>
  )
}

export const InkApp: React.FC<InkAppProps> = ({ initialState, subscribe, onExit }) => {
  const { exit } = useApp()
  const [state, setState] = useState<InkAppState>(initialState)
  const [showLogs, setShowLogs] = useState(true)

  useEffect(() => {
    return subscribe(setState)
  }, [subscribe])

  /**
   * Keyboard input handler.
   * 'q' exits the application gracefully.
   * 'v' toggles the log viewer in fullscreen mode.
   * Ctrl+C is also handled to ensure the process can always be terminated.
   */
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
  })

  const elapsed = state.loopStartTime
    ? Math.floor((Date.now() - state.loopStartTime) / 1000)
    : 0

  const currentTaskElapsed = state.currentTask?.startTime
    ? Math.floor((Date.now() - state.currentTask.startTime) / 1000)
    : 0

  const isFullscreen = state.layout === 'fullscreen'

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
              <Text bold underline>Logs (Press 'v' to toggle)</Text>
              {showLogs && (
                 <Box flexDirection="column" overflowY="hidden">
                    {state.logs.slice(-20).map((log) => (
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

        {/* Sticky Status Bar at bottom */}
        <StatusBar workerStatus={state.workerStatus} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1} height="100%">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
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

      <Box marginY={1}>
        <Text color="green">{'✓ '}{state.stats.completed}</Text>
        <Text color="gray"> | </Text>
        <Text color="red">{'✗ '}{state.stats.failed}</Text>
        <Text color="gray"> | </Text>
        <Text>Total: {state.stats.total}</Text>
      </Box>

      {state.stats.total > 0 && (
        <Box marginTop={1}>
          <ProgressBar
            current={state.stats.completed + state.stats.failed}
            total={state.stats.total}
            width={30}
          />
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

      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        <Text bold color="white">Recent Logs:</Text>
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

      {/* Sticky Status Bar at bottom */}
      <Box marginTop={1}>
        <StatusBar workerStatus={state.workerStatus} />
      </Box>
    </Box>
  )
}
