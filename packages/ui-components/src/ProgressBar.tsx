import React, { useState, useEffect, useRef } from 'react'
import { Box, Text } from 'ink'
import { getEmoji } from './utils'
import type {
  ProgressStartEvent,
  ProgressUpdateEvent,
  ProgressStopEvent,
  IRenderer
} from '@loopwork-ai/contracts'
import { useThemeColor } from './theme/theme'

interface ProgressBarProps {
  id?: string
  renderer?: IRenderer
  current?: number
  total?: number
  message?: string
  indeterminate?: boolean
  width?: number
  completed?: boolean
  useThemeColors?: boolean
}

/**
 * ProgressBar Component
 *
 * A versatile progress bar supporting deterministic and indeterminate modes.
 * Can be controlled via props or by subscribing to an event-based OutputRenderer.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  id,
  renderer,
  current: initialCurrent = 0,
  total: initialTotal = 0,
  message: initialMessage,
  indeterminate: initialIndeterminate = false,
  width = 20,
  completed: initialCompleted = false,
  useThemeColors: useThemeProp = true,
}) => {
  const [current, setCurrent] = useState(initialCurrent)
  const [total, setTotal] = useState(initialTotal)
  const [message, setMessage] = useState(initialMessage)
  const [indeterminate, setIndeterminate] = useState(initialIndeterminate)
  const [completed, setCompleted] = useState(initialCompleted)
  const [success, setSuccess] = useState(true)
  const lastUpdateRef = useRef(0)
  const throttleMs = 50

  const [spinnerIndex, setSpinnerIndex] = useState(0)
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  // Get theme colors
  const themeSuccessColor = useThemeProp ? useThemeColor('success') : 'green'
  const themeErrorColor = useThemeProp ? useThemeColor('error') : 'red'
  const themeProgressColor = useThemeProp ? useThemeColor('progressBar') : 'cyan'
  const themeTrackColor = useThemeProp ? useThemeColor('progressTrack') : 'gray'
  const themeSpinnerColor = useThemeProp ? useThemeColor('spinner') : 'cyan'

  // Event-based subscription
  useEffect(() => {
    if (!renderer) return

    const unsubscribe = renderer.subscribe((event) => {
      // If id is provided, only respond to events with matching id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (id && (!('id' in event) || (event as any).id !== id)) return

      switch (event.type) {
        case 'progress:start': {
          const e = event as ProgressStartEvent
          setIndeterminate(true)
          setMessage(e.message)
          setCompleted(false)
          break
        }
        case 'progress:update': {
          const now = Date.now()
          if (now - lastUpdateRef.current < throttleMs) return
          lastUpdateRef.current = now

          const e = event as ProgressUpdateEvent
          setMessage(e.message)
          if (e.percent !== undefined) {
            setIndeterminate(false)
            setTotal(100)
            setCurrent(e.percent)
          }
          break
        }
        case 'progress:stop': {
          const e = event as ProgressStopEvent
          setCompleted(true)
          if (e.message) setMessage(e.message)
          if (e.success !== undefined) setSuccess(e.success)
          break
        }
      }
    })

    return unsubscribe
  }, [renderer, id])

  useEffect(() => {
    if (!indeterminate || completed) return

    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % spinnerFrames.length)
    }, 80)

    return () => clearInterval(interval)
  }, [indeterminate, completed])

  if (completed) {
    return (
      <Box>
        <Text color={success ? themeSuccessColor : themeErrorColor}>{getEmoji(success ? '✓' : '✗')} </Text>
        <Text>{message || 'Complete'}</Text>
      </Box>
    )
  }

  if (indeterminate || total <= 0) {
    return (
      <Box>
        <Text>
          <Text color={themeSpinnerColor}>{spinnerFrames[spinnerIndex]} </Text>
          {message}
        </Text>
      </Box>
    )
  }

  const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)))
  const filledLength = Math.round((percent / 100) * width)
  const emptyLength = width - filledLength

  const bar = '█'.repeat(filledLength)
  const empty = '░'.repeat(emptyLength)

  return (
    <Box>
      <Text color={themeTrackColor}>[</Text>
      <Text color={themeProgressColor}>{bar}</Text>
      <Text color={themeTrackColor}>{empty}] </Text>
      <Text bold>{percent}%</Text>
      {message && <Text> {message}</Text>}
    </Box>
  )
}
