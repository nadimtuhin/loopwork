import React, { useState, useEffect } from 'react'
import { Text } from 'ink'

interface InkSpinnerProps {
  type?: 'dots' | 'classic' | 'pulse'
  color?: string
}

/**
 * InkSpinner Component
 * 
 * A loading spinner component with multiple frame types and color support.
 * Used for indeterminate progress indication in the TUI.
 */
export const InkSpinner: React.FC<InkSpinnerProps> = ({
  type = 'dots',
  color = 'cyan',
}) => {
  const [frameIndex, setFrameIndex] = useState(0)
  
  const spinnerFrames = {
    dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    classic: ['-', '\\', '|', '/'],
    pulse: ['█', '▓', '▒', '░'],
  }

  const frames = spinnerFrames[type] || spinnerFrames.dots

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length)
    }, 80)
    return () => clearInterval(interval)
  }, [frames.length])

  return <Text color={color}>{frames[frameIndex]}</Text>
}
