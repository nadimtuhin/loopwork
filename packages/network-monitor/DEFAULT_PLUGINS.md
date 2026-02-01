# Default Plugin Recommendations for Loopwork

## Analysis of Current Plugins

Based on the current configuration and plugin ecosystem, here's a recommendation for which plugins should be **enabled by default**:

---

## ✅ RECOMMENDED: Enabled by Default

These plugins provide critical functionality or significant value with minimal risk:

### 1. **Network Monitor** (`@loopwork-ai/network-monitor`) ✨ NEW
- **Why**: Prevents wasted API costs when offline, optimizes worker pool
- **Risk**: None - gracefully handles network changes
- **Default**: `enabled: true` (now defaults to enabled unless explicitly disabled)
- **Classification**: Critical
- **Impact**: Cost savings, reliability, resource optimization

### 2. **Cost Tracking** (`@loopwork-ai/cost-tracking`)
- **Why**: Essential visibility into API spending
- **Risk**: None - read-only monitoring
- **Default**: `enabled: true`
- **Classification**: Enhancement
- **Impact**: Cost awareness, budget enforcement

### 3. **Git Auto-Commit** (`withGitAutoCommit`)
- **Why**: Automatic version control, task traceability
- **Risk**: Low - creates commits, doesn't push
- **Default**: `enabled: true, skipIfNoChanges: true`
- **Classification**: Enhancement
- **Impact**: Version control automation, rollback capability

---

## ⚠️ CONDITIONAL: User Should Decide

These plugins are powerful but have trade-offs:

### 4. **Task Recovery** (`withTaskRecovery`)
- **Why**: AI-powered failure recovery
- **Risk**: Medium - consumes additional API calls, may mask real issues
- **Default**: `enabled: false` (opt-in)
- **Recommendation**: Enable in production, disable in development
- **Classification**: Enhancement
- **Trade-off**: Costs vs. automatic recovery

### 5. **Smart Test Tasks** (`withSmartTestTasks`)
- **Why**: Automatic test task generation
- **Risk**: Medium - creates additional tasks, needs review
- **Default**: `enabled: false, autoCreate: false` (opt-in)
- **Recommendation**: Enable with `autoCreate: false` for suggestions only
- **Classification**: Enhancement
- **Trade-off**: Test coverage vs. task proliferation

---

## ❌ NOT BY DEFAULT: Opt-In Only

These plugins require external configuration or have specific use cases:

### 6. **Telegram Notifications** (`withTelegram`)
- **Why**: Requires bot token and chat ID
- **Risk**: None, but requires setup
- **Default**: Not included unless configured
- **Classification**: Enhancement

### 7. **Discord Webhooks** (`withDiscord`)
- **Why**: Requires webhook URL
- **Risk**: None, but requires setup
- **Default**: Not included unless configured
- **Classification**: Enhancement

### 8. **Asana Integration** (`withAsana`)
- **Why**: Requires Asana credentials
- **Risk**: None, but requires setup
- **Default**: Not included unless configured
- **Classification**: Enhancement

### 9. **Everhour Time Tracking** (`withEverhour`)
- **Why**: Requires Everhour API key
- **Risk**: None, but requires setup
- **Default**: Not included unless configured
- **Classification**: Enhancement

### 10. **Documentation Plugin** (inline plugin)
- **Why**: Project-specific, modifies CHANGELOG.md
- **Risk**: Low, but opinionated
- **Default**: Commented out (example)
- **Classification**: Enhancement
- **Recommendation**: Show as example, let users uncomment

---

## 📋 Proposed Default Configuration

```typescript
export default compose(
  // Backend (required)
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),

  // === ENABLED BY DEFAULT ===
  
  // Network Monitor - Prevents offline API waste, optimizes workers
  withNetworkMonitor(),  // enabled: true by default
  
  // Cost Tracking - Essential visibility
  withCostTracking({ enabled: true }),
  
  // Git Auto-Commit - Version control automation
  withGitAutoCommit({
    enabled: true,
    skipIfNoChanges: true,
  }),

  // === SUGGESTED BUT DISABLED ===
  
  // Task Recovery - Enable in production, disable in dev
  // withTaskRecovery({
  //   enabled: true,
  //   autoRecover: true,
  //   maxRetries: 3,
  // }),
  
  // Smart Test Tasks - Helpful but needs review
  // withSmartTestTasks({
  //   enabled: true,
  //   autoCreate: false,  // Suggest only
  // }),

)(defineConfig({
  parallel: 5,
  maxIterations: 50,
}))
```

---

## 🎯 Rationale for Defaults

### Why Network Monitor Should Be Default

1. **Zero Configuration**: Works out of the box with sensible defaults
2. **Cost Savings**: Prevents API calls when connection is poor/offline
3. **Reliability**: Automatic retry when connection restores
4. **Resource Optimization**: Adjusts workers to match bandwidth
5. **No Downsides**: Gracefully handles all network conditions
6. **Universal Benefit**: Every user benefits regardless of use case

### Why Cost Tracking Should Be Default

1. **Visibility**: Users should always know their spending
2. **Budget Enforcement**: Can set daily limits
3. **Read-Only**: No side effects, pure monitoring
4. **Telemetry**: Valuable data for optimization

### Why Git Auto-Commit Should Be Default

1. **Version Control**: Automatic rollback capability
2. **Task Traceability**: Each commit linked to task
3. **Safe**: Doesn't push, only commits locally
4. **Common Practice**: Most users want this behavior

### Why Task Recovery Should Be Opt-In

1. **Cost**: Consumes additional API calls for analysis
2. **Debugging**: May mask underlying issues
3. **Context-Dependent**: Better in production than development
4. **User Preference**: Some users want explicit control

### Why Smart Test Tasks Should Be Opt-In

1. **Task Proliferation**: Creates additional tasks
2. **Review Needed**: Suggestions may not always be relevant
3. **Project-Specific**: Not all projects need test automation
4. **User Preference**: Some teams have different testing approaches

---

## 🔧 Implementation Changes

### 1. Update Network Monitor Default

```typescript
// packages/network-monitor/src/index.ts
constructor(config: NetworkMonitorConfig = {}) {
  this.config = {
    enabled: config.enabled !== false,  // TRUE unless explicitly disabled
    // ... other config
  }
}
```

### 2. Update Plugin Classification

```typescript
// All default plugins should be classified
export const defaultPlugins = [
  { 
    name: 'network-monitor', 
    classification: 'critical',
    defaultEnabled: true 
  },
  { 
    name: 'cost-tracking', 
    classification: 'enhancement',
    defaultEnabled: true 
  },
  { 
    name: 'git-autocommit', 
    classification: 'enhancement',
    defaultEnabled: true 
  },
]
```

---

## 📊 Plugin Priority Matrix

| Plugin | Default | Classification | Network Required | Config Required |
|--------|---------|----------------|------------------|-----------------|
| Network Monitor | ✅ Yes | Critical | No | No |
| Cost Tracking | ✅ Yes | Enhancement | No | No |
| Git Auto-Commit | ✅ Yes | Enhancement | No | No |
| Task Recovery | ❌ No | Enhancement | Yes | No |
| Smart Test Tasks | ❌ No | Enhancement | Yes | No |
| Telegram | ❌ No | Enhancement | Yes | Yes (token) |
| Discord | ❌ No | Enhancement | Yes | Yes (webhook) |
| Asana | ❌ No | Enhancement | Yes | Yes (API key) |
| Everhour | ❌ No | Enhancement | Yes | Yes (API key) |

---

## 🎓 User Education

When users run `loopwork init`, suggest:

```
✅ Default plugins enabled:
  - Network Monitor (optimizes based on connection)
  - Cost Tracking (monitors API spending)
  - Git Auto-Commit (automatic version control)

💡 Optional plugins available:
  - Task Recovery (AI-powered failure recovery)
  - Smart Test Tasks (automatic test generation)
  - Telegram/Discord (notifications)
  - Asana/Everhour (project management)

Run 'loopwork plugins list' to see all available plugins
Run 'loopwork plugins enable <name>' to enable optional plugins
```

---

## 🚀 Benefits of This Approach

1. **Better Defaults**: Users get immediate value
2. **Cost Optimization**: Network monitor saves money out of the box
3. **Visibility**: Cost tracking shows spending from day one
4. **Version Control**: Git auto-commit provides safety net
5. **Opt-In Complexity**: Advanced features require explicit enable
6. **Clear Separation**: Critical vs. enhancement vs. integration plugins
