# @loopwork-ai/dashboard

A real-time monitoring dashboard for Loopwork.

## Installation

Add the dashboard package to your project:

```bash
bun add @loopwork-ai/dashboard
```

## Configuration

Register the dashboard plugin in your `loopwork.config.ts`:

```typescript
import { defineConfig } from 'loopwork'
import { withDashboard } from '@loopwork-ai/dashboard'

export default defineConfig({
  // your configuration
}).pipe(
  withDashboard({
    port: 3333,
    host: 'localhost',
    enabled: true
  })
)
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `port` | `number` | `3333` | The port the dashboard server will listen on. |
| `host` | `string` | `'localhost'` | The host the dashboard server will bind to. |
| `enabled` | `boolean` | `true` | Whether the dashboard is enabled. |

## Usage

### 1. Start Loopwork

Run your Loopwork tasks as usual. The dashboard server will start alongside Loopwork and listen for events.

```bash
loopwork run
```

### 2. Start the Web UI

To view the dashboard, you need to run the Web UI. If you are developing locally within the Loopwork monorepo:

```bash
# From the packages/dashboard directory
bun run dev:web
```

Or if you have built the dashboard:

```bash
bun run build:web
# Then serve the static files or use the built Next.js app
```

By default, the UI will connect to `http://localhost:3333` to receive real-time updates from Loopwork.

## Architecture

The Loopwork Dashboard consists of three main components:

1.  **Server (Bun)**: A lightweight server that runs as a Loopwork plugin. It captures lifecycle events (loop start, task start/complete/fail, loop end) and broadcasts them.
2.  **SSE (Server-Sent Events)**: The communication layer used to stream real-time updates from the Bun server to the Web UI. This provides a low-overhead, one-way data stream.
3.  **UI (Next.js)**: A modern web interface built with Next.js and Tailwind CSS. It connects to the SSE endpoint and provides a visual representation of your task execution and logs.
