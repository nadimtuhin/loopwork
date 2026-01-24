# Notion Backend Implementation Plan

## Overview
Implement a Notion backend for Loopwork that allows managing tasks via a Notion Database. This will enable Loopwork to pull tasks from Notion, update their status, and write back results/comments.

## Requirements
- **Notion Integration**: An internal integration token from [Notion Developers](https://www.notion.so/my-integrations).
- **Notion Database**: A database shared with the integration, having specific properties.
- **Dependencies**: `@notionhq/client` for API communication.

## Architecture
- **Package**: `packages/notion`
- **Scope**: `@loopwork-ai/notion`
- **Dependencies**: `loopwork` (workspace), `@notionhq/client`.

## Configuration
The backend will be configured via `loopwork.config.ts` using a `withNotionBackend` wrapper.

```typescript
import { withNotionBackend } from '@loopwork-ai/notion'

export default compose(
  withNotionBackend({
    apiKey: process.env.NOTION_API_KEY,
    databaseId: process.env.NOTION_DATABASE_ID,
    // Optional mapping configuration
    properties: {
      status: 'Status',
      priority: 'Priority',
      title: 'Name',
      description: 'Description',
      feature: 'Feature',
    },
    // Optional status values mapping
    statusValues: {
      pending: 'Not Started',
      inProgress: 'In Progress',
      completed: 'Done',
      failed: 'Failed',
    }
  })
)(defineConfig({ ... }))
```

## Data Mapping

| Loopwork Task Field | Notion Property Type | Default Name | Notes |
|---------------------|----------------------|--------------|-------|
| `id` | `title` / `formula` | `Name` / `ID` | Notion Page ID is internal, but we might want a readable ID like `TASK-123` via a formula or just use the Page ID. |
| `title` | `title` | `Name` | The main task title. |
| `status` | `status` or `select` | `Status` | Needs mapping to pending/in_progress/completed/failed. |
| `priority` | `select` | `Priority` | High, Medium, Low. |
| `description` | `rich_text` (body) | `Description` | Can be page content or a text property. Prefer Page Content (blocks) for rich descriptions. |
| `feature` | `select` | `Feature` | Grouping tasks. |
| `parentId` | `relation` | `Parent Task` | For sub-tasks. |
| `dependsOn` | `relation` | `Blocked By` | For dependencies. |

## Implementation Steps

### Phase 1: Package Setup
- [ ] Create `packages/notion` directory structure.
- [ ] Create `package.json` with dependencies.
- [ ] Create `tsconfig.json`.
- [ ] Update root `package.json` workspaces (if not covered by wildcard).

### Phase 2: Core Logic
- [ ] Implement `NotionClient` wrapper around `@notionhq/client`.
    - `queryDatabase(filter)`
    - `getPage(id)`
    - `updatePage(id, properties)`
    - `appendBlock(id, content)` (for comments/logs)
- [ ] Implement `NotionTaskAdapter` class implementing `TaskBackend`.
    - `findNextTask`
    - `markInProgress`, `markCompleted`, etc.
    - Map Notion responses to `Task` interface.

### Phase 3: Plugin Integration
- [ ] Implement `withNotionBackend` configuration wrapper.
- [ ] Export `createNotionBackendPlugin` factory.

### Phase 4: Testing & Documentation
- [ ] Add unit tests for adapter (mocking Notion API).
- [ ] Create `README.md` with setup instructions (creating database, sharing, config).

## Questions/Decisions
- **ID Strategy**: Notion Page IDs are UUIDs (`12345...`). Loopwork tasks usually have short IDs (`TASK-1`).
    - *Decision*: Use Notion Page ID (UUID) as the internal Task ID, but maybe display the Title in logs. Or require a 'Slug'/'ID' property in Notion for cleaner logs. For simplicity V1, use UUID.
- **Description**: Read from Page Content (blocks) or a property?
    - *Decision*: Read Page Content (converted to Markdown) as the description. This matches how GitHub Issues work.
