import React from 'react'
import { Box, Text } from 'ink'
import { useThemeColor } from './theme'

const stripAnsi = (str: string): string => {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, '')
}

export interface ColumnConfig {
  width?: number
  align?: 'left' | 'right' | 'center'
}

export interface TableProps {
  headers: string[]
  rows: string[][]
  columnConfigs?: ColumnConfig[]
  useThemeColors?: boolean
}

export const Table: React.FC<TableProps> = ({
  headers,
  rows,
  columnConfigs,
  useThemeColors: useThemeProp = true,
}) => {
  const configs = columnConfigs && columnConfigs.length > 0
    ? columnConfigs
    : headers.map(() => ({ align: 'left' as const }))

  const themeBorderColor = useThemeProp ? useThemeColor('border') : 'gray'
  const themeTextColor = useThemeProp ? useThemeColor('text') : 'white'

  const columnWidths = headers.map((header, i) => {
    const config = configs[i]
    const configWidth = config && 'width' in config ? config.width : undefined
    if (configWidth !== undefined) return configWidth

    const maxDataWidth = Math.max(
      ...rows.map(row => stripAnsi(row[i] || '').length)
    )
    return Math.max(stripAnsi(header).length, maxDataWidth)
  })

  const alignCell = (text: string, width: number, align: ColumnConfig['align'] = 'left') => {
    const plainText = stripAnsi(text)
    const padding = width - plainText.length
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
      <Box>
        <Text color={themeBorderColor}>┌</Text>
        {columnWidths.map((width, i) => (
          <Text key={`top-${i}`} color={themeBorderColor}>
            {'─'.repeat(width + 2)}
            {i < columnWidths.length - 1 ? '┬' : '┐'}
          </Text>
        ))}
      </Box>

      <Box>
        <Text color={themeBorderColor}>│</Text>
        {headers.map((header, i) => (
          <Text key={`header-${i}`}>
            <Text bold color={themeTextColor}>{' '}{alignCell(header, columnWidths[i], configs[i]?.align)}{' '}</Text>
            <Text color={themeBorderColor}>│</Text>
          </Text>
        ))}
      </Box>

      <Box>
        <Text color={themeBorderColor}>├</Text>
        {columnWidths.map((width, i) => (
          <Text key={`header-sep-${i}`} color={themeBorderColor}>
            {'─'.repeat(width + 2)}
            {i < columnWidths.length - 1 ? '┼' : '┤'}
          </Text>
        ))}
      </Box>

      {rows.map((row, rowIndex) => (
        <Box key={`row-${rowIndex}`}>
          <Text color={themeBorderColor}>│</Text>
          {columnWidths.map((width, cellIndex) => (
            <Text key={`cell-${rowIndex}-${cellIndex}`}>
              {' '}{alignCell(row[cellIndex] || '', width, configs[cellIndex]?.align)}{' '}
              <Text color={themeBorderColor}>│</Text>
            </Text>
          ))}
        </Box>
      ))}

      <Box>
        <Text color={themeBorderColor}>└</Text>
        {columnWidths.map((width, i) => (
          <Text key={`bottom-${i}`} color={themeBorderColor}>
            {'─'.repeat(width + 2)}
            {i < columnWidths.length - 1 ? '┴' : '┘'}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
