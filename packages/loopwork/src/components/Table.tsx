import React from 'react'
import { Box, Text } from 'ink'

interface ColumnConfig {
  width?: number
  align?: 'left' | 'right' | 'center'
}

interface TableProps {
  headers: string[]
  rows: string[][]
  columnConfigs?: ColumnConfig[]
}

export const Table: React.FC<TableProps> = ({
  headers,
  rows,
  columnConfigs,
}) => {
  const configs = columnConfigs && columnConfigs.length > 0
    ? columnConfigs
    : headers.map(() => ({ align: 'left' as const }))

  const columnWidths = headers.map((header, i) => {
    const config = configs[i]
    const configWidth = config && 'width' in config ? config.width : undefined
    if (configWidth !== undefined) return configWidth

    const maxDataWidth = Math.max(
      ...rows.map(row => (row[i] || '').length)
    )
    return Math.max(header.length, maxDataWidth)
  })

  // Determine alignment function
  const alignCell = (text: string, width: number, align: ColumnConfig['align'] = 'left') => {
    const padding = width - text.length
    if (padding <= 0) return text

    if (align === 'right') {
      return ' '.repeat(padding) + text
    } else if (align === 'center') {
      const leftPad = Math.floor(padding / 2)
      const rightPad = padding - leftPad
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad)
    } else {
      return text + ' '.repeat(padding)
    }
  }

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <Box>
        <Text color="gray">┌</Text>
        {columnWidths.map((width, i) => (
          <Text key={`top-${i}`} color="gray">
            {'─'.repeat(width + 2)}
            {i < columnWidths.length - 1 ? '┬' : '┐'}
          </Text>
        ))}
      </Box>

      {/* Header row */}
      <Box>
        <Text color="gray">│</Text>
        {headers.map((header, i) => (
          <Text key={`header-${i}`}>
            {' '}{alignCell(header, columnWidths[i], configs[i]?.align)}{' '}
            <Text color="gray">│</Text>
          </Text>
        ))}
      </Box>

      {/* Header separator */}
      <Box>
        <Text color="gray">├</Text>
        {columnWidths.map((width, i) => (
          <Text key={`header-sep-${i}`} color="gray">
            {'─'.repeat(width + 2)}
            {i < columnWidths.length - 1 ? '┼' : '┤'}
          </Text>
        ))}
      </Box>

      {/* Data rows */}
      {rows.map((row, rowIndex) => (
        <Box key={`row-${rowIndex}`}>
          <Text color="gray">│</Text>
          {row.map((cell, cellIndex) => (
            <Text key={`cell-${rowIndex}-${cellIndex}`}>
              {' '}{alignCell(cell || '', columnWidths[cellIndex], configs[cellIndex]?.align)}{' '}
              <Text color="gray">│</Text>
            </Text>
          ))}
        </Box>
      ))}

      {/* Bottom border */}
      <Box>
        <Text color="gray">└</Text>
        {columnWidths.map((width, i) => (
          <Text key={`bottom-${i}`} color="gray">
            {'─'.repeat(width + 2)}
            {i < columnWidths.length - 1 ? '┴' : '┘'}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
