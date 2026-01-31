import React from 'react'
import { Box, Text } from 'ink'
import { InkBanner } from './InkBanner'
import { getEmoji } from './utils'

interface InkCompletionSummaryProps {
  title: string
  stats: {
    completed: number
    failed: number
    skipped: number
    isDegraded?: boolean
    disabledPlugins?: string[]
  }
  duration?: number
  nextSteps?: string[]
}

/**
 * InkCompletionSummary Component
 * 
 * Renders a comprehensive summary of a task loop completion.
 * Includes success/failure stats, total duration, and suggested next steps.
 */
export const InkCompletionSummary: React.FC<InkCompletionSummaryProps> = ({
  title,
  stats,
  duration,
  nextSteps = [],
}) => {
  const rows = []

  // Add stats row
  const statParts = [
    { label: 'completed', value: stats.completed, color: 'green' },
    { label: 'failed', value: stats.failed, color: 'red' },
    { label: 'skipped', value: stats.skipped, color: 'yellow' },
  ].filter(s => s.value > 0)

  if (statParts.length > 0) {
    rows.push({
      key: 'Stats',
      value: statParts.map(s => `${s.value} ${s.label}`).join(', '),
    })
  }

  // Add duration row
  if (duration !== undefined) {
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    const timeStr = minutes > 0 
      ? `${minutes}m ${seconds % 60}s` 
      : `${seconds}s`
    rows.push({ key: 'Duration', value: timeStr })
  }

  // Add degraded mode info
  if (stats.isDegraded) {
    rows.push({ key: 'Status', value: 'DEGRADED MODE' })
    if (stats.disabledPlugins && stats.disabledPlugins.length > 0) {
      rows.push({ key: 'Disabled', value: stats.disabledPlugins.join(', ') })
    }
  }

  return (
    <Box flexDirection="column">
      <InkBanner title={title} rows={rows} />
      
      {nextSteps.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingX={2}>
          <Text bold>Next Steps:</Text>
          {nextSteps.map((step, index) => (
            <Box key={index}>
              <Text color="cyan">{getEmoji('→')} </Text>
              <Text>{step}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
