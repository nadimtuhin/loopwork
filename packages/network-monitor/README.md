# @loopwork-ai/network-monitor

Internet connectivity and speed monitoring plugin for Loopwork.

## Features

- **Real-time connectivity monitoring** - Continuously checks internet connection status
- **Speed-based worker pool adjustment** - Automatically limits parallel workers based on connection speed
- **Offline protection** - Blocks task execution when internet is unavailable
- **Connection quality detection** - Classifies connections as: offline, poor, fair, good, excellent
- **Smart retry delays** - Configurable delays when offline

## Installation

```bash
bun add @loopwork-ai/network-monitor
```

## Usage

### Basic Setup

```typescript
import { withNetworkMonitor } from '@loopwork-ai/network-monitor'
import { compose, defineConfig } from '@loopwork-ai/loopwork'

export default compose(
  withNetworkMonitor({
    enabled: true,
    checkInterval: 30000,  // Check every 30 seconds
    blockWhenOffline: true,
    adjustWorkerPool: true,
  })
)(defineConfig({
  parallel: 5,
  maxIterations: 50,
}))
```

### Configuration Options

```typescript
interface NetworkMonitorConfig {
  enabled?: boolean                // Enable/disable plugin (default: true)
  checkInterval?: number           // Check interval in ms (default: 30000)
  checkTimeout?: number            // Timeout for checks in ms (default: 5000)
  testHosts?: string[]             // Hosts to test (default: ['1.1.1.1', '8.8.8.8'])
  
  speedThresholds?: {
    minimum: number                // Minimum speed in Mbps (default: 1)
    good: number                   // Good speed in Mbps (default: 10)
    excellent: number              // Excellent speed in Mbps (default: 50)
  }
  
  adjustWorkerPool?: boolean       // Adjust workers based on speed (default: true)
  blockWhenOffline?: boolean       // Block tasks when offline (default: true)
  offlineRetryDelay?: number       // Retry delay when offline in ms (default: 60000)
}
```

### Worker Pool Adjustment

The plugin automatically adjusts the number of parallel workers based on connection speed:

| Connection Quality | Speed Range | Recommended Workers |
|-------------------|-------------|---------------------|
| Offline | No connection | 0 (blocks execution) |
| Poor | < 1 Mbps | 1 worker |
| Fair | 1-10 Mbps | 2 workers |
| Good | 10-50 Mbps | 3 workers |
| Excellent | > 50 Mbps | 5 workers |

## Example Scenarios

### Prevent Tasks When Offline

```typescript
withNetworkMonitor({
  blockWhenOffline: true,
  offlineRetryDelay: 60000,  // Retry every minute
})
```

### Conservative Mode (Slow Connection)

```typescript
withNetworkMonitor({
  speedThresholds: {
    minimum: 0.5,   // Very slow minimum
    good: 5,        // Lower threshold for "good"
    excellent: 25,  // Lower threshold for "excellent"
  },
  adjustWorkerPool: true,
})
```

### Aggressive Mode (Fast Connection)

```typescript
withNetworkMonitor({
  speedThresholds: {
    minimum: 5,
    good: 25,
    excellent: 100,
  },
  checkInterval: 60000,  // Check less frequently
})
```

## How It Works

1. **Connectivity Check**: Tests DNS resolution against configured hosts
2. **Speed Test**: Downloads a small file from Cloudflare to measure speed
3. **Quality Classification**: Determines connection quality based on measured speed
4. **Worker Adjustment**: Recommends worker pool size based on quality
5. **Task Blocking**: Prevents task execution when offline (if enabled)

## Events

The plugin emits console logs for important events:

- `🌐 Network monitor started` - Monitoring has begun
- `⚠️ Internet connection lost` - Connection lost
- `⚠️ Slow connection detected` - Speed below threshold
- `✅ Connection restored` - Back online
- `❌ Cannot start task: No internet connection` - Task blocked

## API

### NetworkMonitor Class

```typescript
import { NetworkMonitor } from '@loopwork-ai/network-monitor'

const monitor = new NetworkMonitor({
  checkInterval: 30000,
})

monitor.start()

const status = monitor.getStatus()
// {
//   online: true,
//   quality: 'good',
//   downloadSpeed: 25.5,
//   latency: 45,
//   recommendedWorkers: 3,
//   lastCheck: Date
// }

const recommended = monitor.getRecommendedWorkers(5)

monitor.onChange((status) => {
  console.log('Network status changed:', status)
})

monitor.stop()
```

## License

MIT
