# @loopwork-ai/control-api

Control API plugin for Loopwork that provides REST endpoints to manage tasks and control the loop.

## Installation

```bash
bun install @loopwork-ai/control-api
```

## Configuration

Add to your `loopwork.config.ts`:

```typescript
import { compose, defineConfig } from 'loopwork'
import { withControlApi } from '@loopwork-ai/control-api'

export default compose(
  withControlApi({
    port: 3333,
    enabled: true,
    auth: {
      apiKeys: [{ key: 'my-secret-key', name: 'Admin' }],
      jwt: {
        secret: 'your-jwt-secret',
        refreshSecret: 'your-refresh-secret', // Optional, for /auth/refresh
        expiresIn: 3600 // Optional, default 1 hour
      }
    }
  })
)(defineConfig({ ... }))
```

## Authentication

The Control API supports two authentication methods:

1. **API Key**: Pass the key in the `X-API-Key` header.
2. **JWT**: Pass a valid Bearer token in the `Authorization` header.

### JWT Token Refresh

**POST /auth/refresh**

Exchange a valid refresh token for a new access token.

**Request:**
```json
{
  "refreshToken": "..."
}
```

**Response:**
```json
{
  "token": "..."
}
```

## API Endpoints

### GET /tasks

List tasks with filtering, sorting, and pagination.

**Query Parameters:**
- `limit`: Number of tasks to return (default: 50)
- `offset`: Offset for pagination (default: 0)
- `status`: Filter by status (comma-separated: `pending,in-progress`)
- `priority`: Filter by priority (`high`, `medium`, `low`)
- `feature`: Filter by feature name
- `sort`: Field to sort by (`id`, `title`, `status`, `priority`, `createdAt`)
- `order`: Sort order (`asc` or `desc`, default: `asc`)

**Response:**
```json
{
  "data": [
    {
      "id": "TASK-1",
      "title": "My Task",
      "status": "pending",
      "priority": "high",
      "timestamps": {
        "createdAt": "2023-01-01T00:00:00Z"
      }
    }
  ],
  "meta": {
    "total": 100,
    "limit": 50,
    "offset": 0
  }
}
```

### GET /tasks/:id

Get details for a specific task.

**Response:**
```json
{
  "data": {
    "id": "TASK-1",
    "title": "My Task",
    ...
  }
}
```

### GET /health

Check API health.
