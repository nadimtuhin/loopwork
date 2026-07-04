import React from 'react'
import { Box, Text } from 'ink'
import { Banner } from './Banner'
import { getEmoji } from './utils'
import { formatDuration } from '@loopwork-ai/common'

export interface CompletionSummaryProps {
  title: string
  stats?: {
    completed?: number
    failed?: number
    skipped?: number
    isDegraded?: boolean
    disabledPlugins?: string[]
  }
  duration?: number
  nextSteps?: string[]
  mode?: 'detailed' | 'compact'
  useThemeColors?: boolean
}

/**
 * CompletionSummary Component
 *
 * Renders a comprehensive summary of a task loop completion.
 * Support both detailed and compact modes.
 * Includes success/failure stats with colors, total duration, and suggested next steps.
 */
export const CompletionSummary: React.FC<CompletionSummaryProps> = ({
  title,
  stats,
  duration,
  nextSteps = [],
  mode = 'detailed',
  useThemeColors = true,
}) => {
  const rows: Array<{ key: string; value: React.ReactNode }> = []

  if (stats) {
    const hasStats = (stats.completed || 0) > 0 || (stats.failed || 0) > 0 || (stats.skipped || 0) > 0
    if (hasStats) {
      const statsParts: React.ReactNode[] = []
      if ((stats.completed || 0) > 0) {
        statsParts.push(<Text key="completed" color="green">{stats.completed} completed</Text>)
      }
      if ((stats.failed || 0) > 0) {
        if (statsParts.length > 0) statsParts.push(<Text key="s1">, </Text>)
        statsParts.push(<Text key="failed" color="red">{stats.failed} failed</Text>)
      }
      if ((stats.skipped || 0) > 0) {
        if (statsParts.length > 0) statsParts.push(<Text key="s2">, </Text>)
        statsParts.push(<Text key="skipped" color="yellow">{stats.skipped} skipped</Text>)
      }

      rows.push({
        key: 'Stats',
        value: (
          <Box>
            {statsParts}
          </Box>
        )
      })
    } else {
      rows.push({ key: 'Stats', value: <Text color="gray">No tasks processed</Text> })
    }
  }

  if (duration !== undefined) {
    rows.push({ key: 'Duration', value: <Text color="cyan">{formatDuration(duration)}</Text> })
  }

  if (stats?.isDegraded) {
    rows.push({
      key: 'Status',
      value: (
        <Box flexDirection="column">
          <Text color="yellow">⚡ REDUCED/DEGRADED MODE</Text>
          {stats.disabledPlugins && stats.disabledPlugins.length > 0 && (
            <Text color="gray" dimColor>Disabled: {stats.disabledPlugins.join(', ')}</Text>
          )}
        </Box>
      )
    })
  }

  if (nextSteps.length > 0) {
    rows.push({
      key: 'Next Steps',
      value: (
        <Box flexDirection="column">
          {nextSteps.map((step, i) => (
            <Box key={i}>
              <Text color="cyan">{getEmoji('→')} </Text>
              <Text>{step}</Text>
            </Box>
          ))}
        </Box>
      )
    })
  }

  return (
    <Box flexDirection="column" marginTop={mode === 'compact' ? 0 : 1}>
      <Banner
        title={title.toUpperCase()}
        rows={rows}
        style={mode === 'compact' ? 'light' : 'heavy'}
        useThemeColors={useThemeColors}
      />
    </Box>
  )
}
