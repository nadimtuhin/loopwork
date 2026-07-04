import React from 'react'
import { Box, Text } from 'ink'
import { useTheme, useThemeColor } from '../theme'

interface InkBannerProps {
  title: string
  rows?: Array<{ key: string; value: string }>
  style?: 'light' | 'heavy'
  borderColor?: string
  useThemeColors?: boolean
}

/**
 * InkBanner Component
 *
 * Renders a stylized banner with a title and optional key-value rows.
 * Used for startup, completion, or important announcements.
 */
export const InkBanner: React.FC<InkBannerProps> = ({
  title,
  rows = [],
  style = 'heavy',
  borderColor: propBorderColor,
  useThemeColors: useThemeProp = true,
}) => {
  const borderStyle = style === 'heavy' ? 'double' : 'single'

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
          {title.toUpperCase()}
        </Text>
      </Box>

      {rows.length > 0 && (
        <Box flexDirection="column">
          {rows.map((row, index) => (
            <Box key={index}>
              <Text color={themeMutedColor}>{row.key}: </Text>
              <Text color={themeTextColor}>{row.value}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
