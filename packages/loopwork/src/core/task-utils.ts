import type { Task } from '../backends'

export function generateSuccessCriteria(task: Task): string[] {
  const criteria: string[] = []
  const desc = task.description.toLowerCase()
  const title = task.title.toLowerCase()

  if (desc.includes('test') || title.includes('test')) {
    criteria.push('All related tests pass (`bun test` or `yarn test`)')
  }

  if (desc.includes('api') || desc.includes('endpoint') || desc.includes('graphql')) {
    criteria.push('API endpoint is functional and returns expected responses')
    criteria.push('GraphQL schema validates (no SDL errors)')
  }

  if (desc.includes('component') || desc.includes('page') || desc.includes('ui') || desc.includes('button')) {
    criteria.push('Component renders without errors')
    criteria.push('UI matches the requirements described in the PRD')
  }

  if (desc.includes('database') || desc.includes('migration') || desc.includes('prisma') || desc.includes('model')) {
    criteria.push('Database migrations apply cleanly')
    criteria.push('Prisma schema is valid (`yarn rw prisma validate`)')
  }

  if (desc.includes('fix') || desc.includes('bug') || title.includes('fix')) {
    criteria.push('The bug is fixed and no longer reproducible')
    criteria.push('No regression in related functionality')
  }

  if (desc.includes('refactor') || title.includes('refactor')) {
    criteria.push('Code behavior is unchanged after refactoring')
    criteria.push('Existing tests still pass')
  }

  if (criteria.length === 0) {
    criteria.push('Implementation matches the PRD requirements')
    criteria.push('No type errors (`yarn rw type-check`)')
    criteria.push('Code follows project conventions')
  }

  return criteria
}

export function generateFailureCriteria(task: Task): string[] {
  const criteria: string[] = []
  const desc = task.description.toLowerCase()

  criteria.push('Type errors exist after changes')
  criteria.push('Tests fail that were passing before')

  if (desc.includes('auth') || desc.includes('password') || desc.includes('login') || desc.includes('security')) {
    criteria.push('Security vulnerabilities introduced (injection, XSS, etc.)')
  }

  if (desc.includes('api') || desc.includes('interface') || desc.includes('contract')) {
    criteria.push('Breaking changes to existing API contracts')
  }

  return criteria
}

export function buildPrompt(task: Task, retryContext: string = ''): string {
  const url = task.metadata?.url || task.metadata?.prdFile || ''
  const urlLine = url ? `\nSource: ${url}` : ''

  const successCriteria = generateSuccessCriteria(task)
  const failureCriteria = generateFailureCriteria(task)

  return `# Task: ${task.id}

## Title
${task.title}

## PRD (Product Requirements)
${task.description}

## Success Criteria
The task is considered COMPLETE when:
${successCriteria.map(c => `- [ ] ${c}`).join('\n')}

## Failure Criteria
The task should be marked FAILED if:
${failureCriteria.map(c => `- ${c}`).join('\n')}

## Instructions
1. Read the PRD carefully and understand the requirements
2. Implement the task as described
3. Verify against the success criteria above
4. Run relevant tests to verify your changes
5. If tests fail, fix the issues before marking complete

${retryContext ? `## Previous Attempt Context\n${retryContext}` : ''}

## Important
- Follow the project's coding style (no semicolons, single quotes, 2-space indent)
- Run \`yarn rw type-check\` before tests
- Self-verify against success criteria before marking complete
${urlLine}
`
}
