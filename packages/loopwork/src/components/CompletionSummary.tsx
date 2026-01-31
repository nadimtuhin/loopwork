import React from 'react'
import { Box, Text } from 'ink'
import { Banner } from './Banner'
import { getEmoji } from './utils'

interface CompletionSummaryProps {
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
}

export const CompletionSummary: React.FC<CompletionSummaryProps> = ({
  title,
  stats,
  duration,
  nextSteps = [],
}) => {
  const isTTY = process.stdout.isTTY ?? false

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  if (!isTTY) {
    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        <Text>{'='.repeat(title.length)}</Text>
        <Box marginTop={1} flexDirection="column">
          {stats && (
            (stats.completed || 0) > 0 ||
            (stats.failed || 0) > 0 ||
            (stats.skipped || 0) > 0 ? (
              <Text>
                Stats: {' '}
                {(stats.completed || 0) > 0 && `${stats.completed} completed`}
                {(stats.completed || 0) > 0 && (stats.failed || 0) > 0 && ', '}
                {(stats.failed || 0) > 0 && `${stats.failed} failed`}
                {((stats.completed || 0) > 0 || (stats.failed || 0) > 0) && (stats.skipped || 0) > 0 && ', '}
                {(stats.skipped || 0) > 0 && `${stats.skipped} skipped`}
              </Text>
            ) : null
          )}
          {duration !== undefined && (
            <Box marginTop={1}>
              <Text>Duration: {formatDuration(duration)}</Text>
            </Box>
          )}
          {stats?.isDegraded && (
            <Box marginTop={1}>
              <Text>Status: RUNNING IN REDUCED/DEGRADED MODE</Text>
              {stats.disabledPlugins && stats.disabledPlugins.length > 0 && (
                <Text>Disabled Plugins: {stats.disabledPlugins.join(', ')}</Text>
              )}
            </Box>
          )}
          {nextSteps.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text bold>Next Steps:</Text>
              {nextSteps.map((step, i) => (
                <Text key={i}>
                  {'  '}{getEmoji('→')} {step}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  const rows: Array<{ key: string; value: string }> = []

  if (stats && (
    (stats.completed || 0) > 0 ||
    (stats.failed || 0) > 0 ||
    (stats.skipped || 0) > 0
  )) {
    const statsParts: string[] = []
    if ((stats.completed || 0) > 0) {
      statsParts.push(`${stats.completed} completed`)
    }
    if ((stats.failed || 0) > 0) {
      statsParts.push(`${stats.failed} failed`)
    }
    if ((stats.skipped || 0) > 0) {
      statsParts.push(`${stats.skipped} skipped`)
    }

    if (statsParts.length > 0) {
      rows.push({ key: 'Stats', value: statsParts.join(', ') })
    }
  }

  if (duration !== undefined) {
    rows.push({ key: 'Duration', value: formatDuration(duration) })
  }

  if (stats?.isDegraded) {
    rows.push({ key: 'Status', value: '⚡ REDUCED/DEGRADED MODE' })
    if (stats.disabledPlugins && stats.disabledPlugins.length > 0) {
      rows.push({ key: 'Disabled', value: stats.disabledPlugins.join(', ') })
    }
  }

  if (nextSteps.length > 0) {
    const nextStepsText = nextSteps.map((s, i) => {
      const prefix = i === 0 ? getEmoji('→') : ' '
      return `${prefix} ${s}`
    }).join('\n  ')
    rows.push({ key: 'Next Steps', value: nextStepsText })
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Banner
        title={title}
        rows={rows}
      />
    </Box>
  )
}
