/**
 * Kanban Board TUI
 *
 * Simple kanban view of tasks using ink (React for CLI)
 */

import React, { useState, useEffect } from 'react'
import { render, Box, Text, useInput, useApp } from 'ink'
import type { Task, TaskStatus } from '../contracts'
import { createBackend, detectBackend } from '../backends'

interface Column {
  status: TaskStatus
  title: string
  color: string
  tasks: Task[]
}

interface KanbanProps {
  projectRoot: string
  refreshInterval?: number
}

function TaskCard({ task, selected }: { task: Task; selected: boolean }) {
  const priorityColor = {
    high: 'red',
    medium: 'yellow',
    low: 'gray',
  }[task.priority]

  return (
    <Box
      flexDirection="column"
      borderStyle={selected ? 'double' : 'single'}
      borderColor={selected ? 'cyan' : 'gray'}
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color={selected ? 'cyan' : 'white'}>
        {task.id}
      </Text>
      <Text wrap="truncate-end">
        {task.title.length > 28 ? task.title.slice(0, 25) + '...' : task.title}
      </Text>
      <Box>
        <Text color={priorityColor}>[{task.priority}]</Text>
        {task.feature && <Text color="blue"> #{task.feature}</Text>}
      </Box>
    </Box>
  )
}

function KanbanColumn({ column, selectedTask }: { column: Column; selectedTask: string | null }) {
  return (
    <Box flexDirection="column" width="33%" paddingX={1}>
      <Box marginBottom={1} justifyContent="center">
        <Text bold color={column.color}>
          {column.title} ({column.tasks.length})
        </Text>
      </Box>
      <Box flexDirection="column" borderStyle="single" borderColor={column.color} minHeight={10}>
        {column.tasks.length === 0 ? (
          <Box padding={1}>
            <Text color="gray" dimColor>
              No tasks
            </Text>
          </Box>
        ) : (
          column.tasks.slice(0, 5).map((task) => (
            <TaskCard key={task.id} task={task} selected={selectedTask === task.id} />
          ))
        )}
        {column.tasks.length > 5 && (
          <Box paddingX={1}>
            <Text color="gray">+{column.tasks.length - 5} more</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

function KanbanBoard({ projectRoot, refreshInterval = 5000 }: KanbanProps) {
  const { exit } = useApp()
  const [columns, setColumns] = useState<Column[]>([
    { status: 'pending', title: 'PENDING', color: 'yellow', tasks: [] },
    { status: 'in-progress', title: 'IN PROGRESS', color: 'blue', tasks: [] },
    { status: 'completed', title: 'COMPLETED', color: 'green', tasks: [] },
  ])
  const [selectedColumn, setSelectedColumn] = useState(0)
  const [selectedRow, setSelectedRow] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const loadTasks = async () => {
    try {
      const backendConfig = detectBackend(projectRoot)
      const backend = createBackend(backendConfig)

      // Get all tasks
      const pending = await backend.listPendingTasks()

      // For completed/in-progress, we need to check all tasks
      // This is a simplified approach - in reality you might want a listAllTasks method
      const allTasks = pending // For now, just show pending tasks in the board

      setColumns([
        {
          status: 'pending',
          title: 'PENDING',
          color: 'yellow',
          tasks: allTasks.filter((t) => t.status === 'pending'),
        },
        {
          status: 'in-progress',
          title: 'IN PROGRESS',
          color: 'blue',
          tasks: allTasks.filter((t) => t.status === 'in-progress'),
        },
        {
          status: 'completed',
          title: 'COMPLETED',
          color: 'green',
          tasks: allTasks.filter((t) => t.status === 'completed'),
        },
      ])
      setLastRefresh(new Date())
      setError(null)
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => {
    loadTasks()
    const interval = setInterval(loadTasks, refreshInterval)
    return () => clearInterval(interval)
  }, [projectRoot, refreshInterval])

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit()
      return
    }

    if (input === 'r') {
      loadTasks()
      return
    }

    if (key.leftArrow) {
      setSelectedColumn((c) => Math.max(0, c - 1))
      setSelectedRow(0)
    }
    if (key.rightArrow) {
      setSelectedColumn((c) => Math.min(columns.length - 1, c + 1))
      setSelectedRow(0)
    }
    if (key.upArrow) {
      setSelectedRow((r) => Math.max(0, r - 1))
    }
    if (key.downArrow) {
      const maxRow = Math.min(4, columns[selectedColumn].tasks.length - 1)
      setSelectedRow((r) => Math.min(maxRow, r + 1))
    }
  })

  const selectedTask = columns[selectedColumn]?.tasks[selectedRow]?.id || null
  const totalTasks = columns.reduce((sum, c) => sum + c.tasks.length, 0)

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          LOOPWORK KANBAN
        </Text>
        <Text color="gray">
          {totalTasks} tasks | Last refresh: {lastRefresh.toLocaleTimeString()}
        </Text>
      </Box>

      {/* Error */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Columns */}
      <Box flexDirection="row">
        {columns.map((column, idx) => (
          <KanbanColumn
            key={column.status}
            column={column}
            selectedTask={idx === selectedColumn ? selectedTask : null}
          />
        ))}
      </Box>

      {/* Footer */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          [←/→] Switch column | [↑/↓] Select task | [r] Refresh | [q] Quit
        </Text>
      </Box>

      {/* Selected task details */}
      {selectedTask && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" paddingX={1}>
          <Text bold>Selected: {selectedTask}</Text>
          <Text>{columns[selectedColumn].tasks[selectedRow]?.title}</Text>
        </Box>
      )}
    </Box>
  )
}

export function runKanban(projectRoot: string = process.cwd()) {
  render(<KanbanBoard projectRoot={projectRoot} />)
}

// CLI entry point
if (import.meta.main) {
  runKanban(process.cwd())
}
