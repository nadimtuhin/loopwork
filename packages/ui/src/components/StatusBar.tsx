import React from 'react'
import { Box, Text } from 'ink'
import { InkAppState } from './InkApp'

export const StatusBar: React.FC<{ workerStatus: InkAppState['workerStatus'] }> = ({ workerStatus }) => {
  const { 
    totalWorkers, 
    activeWorkers, 
    pendingTasks, 
    runningTasks, 
    completedTasks, 
    failedTasks 
  } = workerStatus

  return (
    <Box 
      flexDirection="row" 
      borderStyle="single" 
      borderColor="blue" 
      paddingX={1}
    >
      <Box marginRight={2}>
        <Text color="white" bold>Workers:</Text>
        <Text color="yellow"> {activeWorkers}</Text>
        <Text color="gray">/</Text>
        <Text color="white">{totalWorkers}</Text>
      </Box>

      <Text color="gray">|</Text>

      <Box marginLeft={2} marginRight={2}>
        <Text color="white" bold>Tasks:</Text>
        <Text color="cyan"> {pendingTasks}</Text>
        <Text color="gray"> pending</Text>
        <Text color="gray"> · </Text>
        <Text color="yellow">{runningTasks}</Text>
        <Text color="gray"> running</Text>
        <Text color="gray"> · </Text>
        <Text color="green">{completedTasks}</Text>
        <Text color="gray"> done</Text>
        {failedTasks > 0 && (
          <>
            <Text color="gray"> · </Text>
            <Text color="red">{failedTasks}</Text>
            <Text color="gray"> failed</Text>
          </>
        )}
      </Box>
    </Box>
  )
}
