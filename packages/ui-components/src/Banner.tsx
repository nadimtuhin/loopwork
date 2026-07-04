import React from 'react'
import { Box, Text } from 'ink'
import { useThemeColor } from './theme'

interface BannerProps {
  title: string
  rows?: Array<{ key: string; value: React.ReactNode }>
  style?: 'light' | 'heavy' | 'round'
  borderColor?: string
  useThemeColors?: boolean
}

export const Banner: React.FC<BannerProps> = ({
  title,
  rows = [],
  style = 'heavy',
  borderColor: propBorderColor,
  useThemeColors: useThemeProp = true,
}) => {
  const borderStyle = style === 'heavy' ? 'double' : style === 'round' ? 'round' : 'single'

  const themeBorderColor = useThemeProp ? useThemeColor('borderHighlight') : 'cyan'
  const borderColor = propBorderColor || themeBorderColor

  const themeTextColor = useThemeProp ? useThemeColor('text') : 'white'
  const themeMutedColor = useThemeProp ? useThemeColor('textMuted') : 'gray'

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={2}
      minWidth={40}
    >
      <Box justifyContent="center" marginBottom={rows.length > 0 ? 1 : 0}>
        <Text bold color={themeTextColor}>
          {title}
        </Text>
      </Box>

      {rows.length > 0 && (
        <Box flexDirection="column">
          {rows.map((row, index) => (
            <Box key={index}>
              <Text color={themeMutedColor}>{row.key}: </Text>
              {typeof row.value === 'string' ? (
                <Text color={themeTextColor}>{row.value}</Text>
              ) : (
                row.value
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
