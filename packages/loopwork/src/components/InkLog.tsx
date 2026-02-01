import React from 'react'
import { Box, Text } from 'ink'
import { getEmoji } from './utils'

interface InkLogProps {
  message: string
  level?: 'info' | 'success' | 'warn' | 'error' | 'debug' | 'trace'
  timestamp?: boolean
}

/**
 * InkLog Component
 * 
 * Renders a log message with level-based colors, emojis, and optional timestamps.
 * Designed to work with the event-based output system.
 */
export const InkLog: React.FC<InkLogProps> = ({
  message,
  level = 'info',
  timestamp = true,
}) => {
  const getLevelInfo = () => {
    switch (level) {
      case 'info':
        return { color: 'blue', emoji: 'ℹ️', prefix: 'INFO:' }
      case 'success':
        return { color: 'green', emoji: '✅', prefix: 'SUCCESS:' }
      case 'warn':
        return { color: 'yellow', emoji: '⚠️', prefix: 'WARN:' }
      case 'error':
        return { color: 'red', emoji: '❌', prefix: 'ERROR:' }
      case 'debug':
        return { color: 'gray', emoji: '[DEBUG]', prefix: '' }
      case 'trace':
        return { color: 'gray', emoji: '[TRACE]', prefix: '' }
      default:
        return { color: 'white', emoji: '', prefix: '' }
    }
  }

  const { color, emoji, prefix } = getLevelInfo()
  // Use 24-hour format for consistent width (always 8 chars: HH:MM:SS)
  const timeStr = timestamp ? `[${new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })}] ` : ''

  return (
    <Box>
      {timestamp && <Text color="gray">{timeStr}</Text>}
      {emoji && <Text color={color}>{getEmoji(emoji)} </Text>}
      {prefix && <Text color={color} bold>{prefix} </Text>}
      <Text>{message}</Text>
    </Box>
  )
}
