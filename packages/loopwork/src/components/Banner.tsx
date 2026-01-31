import React from 'react'
import { Box, Text } from 'ink'

interface BannerProps {
  title: string
  rows?: Array<{ key: string; value: string }>
  style?: 'light' | 'heavy'
  borderColor?: string
}

export const Banner: React.FC<BannerProps> = ({ 
  title, 
  rows = [], 
  style = 'heavy',
  borderColor = 'cyan'
}) => {
  const borderStyle = style === 'heavy' ? 'double' : 'single'

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={2}
      minWidth={40}
    >
      <Box justifyContent="center" marginBottom={rows.length > 0 ? 1 : 0}>
        <Text bold color="white">
          {title}
        </Text>
      </Box>

      {rows.length > 0 && (
        <Box flexDirection="column">
          {rows.map((row, index) => (
            <Box key={index}>
              <Text color="gray">{row.key}: </Text>
              <Text color="white">{row.value}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
