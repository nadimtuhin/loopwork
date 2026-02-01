import React from 'react'
import { Box, Text } from 'ink'

interface InkStreamProps {
  lines: string[]
  prefix?: string
  prefixColor?: string
  limit?: number
}

/**
 * InkStream Component
 * 
 * Renders a list of lines representing a CLI subprocess stream.
 * Supports prefixing each line with a magenta/magenta-cyan tag and optional line limit.
 */
export const InkStream: React.FC<InkStreamProps> = ({
  lines,
  prefix,
  prefixColor = 'magenta',
  limit = 10,
}) => {
  const displayLines = lines.slice(-limit)
  // Use 24-hour format for consistent width (always 8 chars: HH:MM:SS)
  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  return (
    <Box flexDirection="column">
      {displayLines.map((line, index) => (
        <Box key={index}>
          <Text color="gray">{timeStr} │</Text>
          {prefix && <Text color={prefixColor}> [{prefix}]</Text>}
          <Text color="gray"> {line}</Text>
        </Box>
      ))}
    </Box>
  )
}
