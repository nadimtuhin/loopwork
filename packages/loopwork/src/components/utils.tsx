import React from 'react'
import { Box, Text } from 'ink'

export const BOX_CHARS = {
  light: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
  },
  heavy: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
  },
} as const

const EMOJI_FALLBACKS: Record<string, string> = {
  '✅': '[OK]',
  '❌': '[ERR]',
  '⚠️': '[WARN]',
  'ℹ️': '[INFO]',
  '→': '->',
  '✓': '[+]',
  '✗': '[x]',
  '●': '*',
  '○': 'o',
}

export function supportsEmoji(): boolean {
  if (!process.stdout.isTTY) return false
  if (process.platform === 'win32') return true
  return Boolean(process.env.TERM && process.env.TERM !== 'dumb')
}

export function getEmoji(emoji: string): string {
  return supportsEmoji() ? emoji : (EMOJI_FALLBACKS[emoji] || emoji)
}

export type SeparatorType = 'light' | 'heavy' | 'section'

export interface SeparatorProps {
  separatorType?: SeparatorType
  width?: number
}

export const Separator: React.FC<SeparatorProps> = ({
  separatorType = 'light',
  width,
}) => {
  const terminalWidth = width || process.stdout.columns || 120

  if (separatorType === 'section') {
    return (
      <Box>
        <Text>{'\n'}</Text>
        <Text color="gray">{'─'.repeat(terminalWidth)}</Text>
        <Text>{'\n'}</Text>
      </Box>
    )
  }

  const char = separatorType === 'heavy' ? BOX_CHARS.heavy.horizontal : BOX_CHARS.light.horizontal
  return <Text color="gray">{char.repeat(terminalWidth)}</Text>
}

