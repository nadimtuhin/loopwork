# Loopwork Architecture Diagrams

This document contains visual architecture diagrams for Loopwork, rendered using Mermaid.

## Table of Contents

- [CLI Invocation Flow](#cli-invocation-flow)
- [Monorepo Structure](#monorepo-structure)
- [Configuration System](#configuration-system)
- [Config Hot Reload](#config-hot-reload)
- [Plugin System](#plugin-system)
- [Backend System](#backend-system)
- [Task Execution Flow](#task-execution-flow)
- [State Management](#state-management)
- [Process Management](#process-management)
- [Orphan Detection](#orphan-detection)
- [AI Monitor & Self-Healing](#ai-monitor--self-healing)
- [Claude Plugin Architecture](#claude-plugin-architecture)
- [Resource Pool Management](#resource-pool-management)
- [Output System Architecture](#output-system-architecture)
- [File Locking Pattern](#file-locking-pattern)
- [Parallel Execution Architecture](#parallel-execution-architecture)

## CLI Invocation Flow

```mermaid
flowchart TD
    Start([Start]) --> GetModel[Get next model from pool<br/>round-robin]

    subgraph PrimaryPool ["Primary Pool (EXEC_MODELS)"]
        P1[Claude: Sonnet]
        P2[OpenCode: Sonnet]
        P3[OpenCode: Gemini Flash]
    end

    subgraph FallbackPool ["Fallback Pool (FALLBACK_MODELS)"]
        F1[Claude: Opus]
        F2[OpenCode: Gemini Pro]
    end

    GetModel --> PrimaryPool
    GetModel --> FallbackPool

    Execute[Execute CLI with timeout]
    PrimaryPool --> Execute
    FallbackPool -.->|exhausted primary| Execute

    Execute --> CheckResult{Check Result}

    CheckResult -->|Success| Done([DONE])
    CheckResult -->|Rate Limit| Wait[Wait 30s<br/>continue]
    CheckResult -->|Timeout/Error| NextModel[Try next model]

    Wait --> Execute

    NextModel -->|primary exhausted| FallbackPool
    NextModel -->|primary not exhausted| PrimaryPool

    style Start fill:#e1f5e4
    style Done fill:#4caf50
    style CheckResult fill:#ff9800
    style Execute fill:#2196f3
    style Wait fill:#ff9800
```

## Monorepo Structure

```mermaid
graph TD
    Root[loopwork/]

    subgraph CorePackages ["Core Packages"]
        Loopwork[packages/loopwork/<br/>Core Framework]
        Contracts[packages/contracts/<br/>Type Definitions]
        Common[packages/common/<br/>Shared Utilities]
        State[packages/state/<br/>State Domain]
        Executor[packages/executor/<br/>Execution Engine]
        ProcessManager[packages/process-manager/<br/>Process Infrastructure]
        Resilience[packages/resilience/<br/>Resilience Engine]
    end

    subgraph PluginPackages ["Plugin Packages"]
        Telegram[packages/telegram/<br/>Telegram Notifications]
        Discord[packages/discord/<br/>Discord Webhooks]
        Asana[packages/asana/<br/>Asana Integration]
        Todoist[packages/todoist/<br/>Todoist Sync]
        Trello[packages/trello/<br/>Trello Sync]
        Everhour[packages/everhour/<br/>Time Tracking]
        Notion[packages/notion/<br/>Notion Backend]
        CostTracking[packages/cost-tracking/<br/>Token Monitoring]
        Checkpoint[packages/checkpoint/<br/>State Persistence]
        Dashboard[packages/dashboard/<br/>Interactive Dashboard]
        ControlAPI[packages/control-api/<br/>REST API]
    end

    subgraph Examples ["Examples"]
        Basic[examples/basic-json-backend/<br/>Basic JSON Backend]
    end

    Root --> CorePackages
    Root --> PluginPackages
    Root --> Examples

    style Root fill:#1565c0
    style CorePackages fill:#1e88e5
    style PluginPackages fill:#2e7d32
    style Examples fill:#43a047
```

## Configuration System

```mermaid
flowchart LR
    ConfigFile[loopwork.config.ts<br/>TypeScript Config]

    ConfigFile --> DefineConfig[defineConfig()<br/>Type Safety + Defaults]
    DefineConfig --> Compose[compose()<br/>Chain Wrappers]
    Compose --> Plugins[withPlugin()<br/>withJSONBackend()<br/>etc.]
    Plugins --> FinalConfig[Final LoopworkConfig Object]

    style ConfigFile fill:#e1f5e4
    style FinalConfig fill:#4caf50
```

## Config Hot Reload

```mermaid
flowchart TD
    Start[getConfig() called<br/>hotReload=true]

    Start --> Manager[ConfigHotReloadManager<br/>.start()]

    Manager --> Watch[chokidar.watch()<br/>File Watcher Active]

    Watch -->|Config Modified| Detect[Watcher detects change]

    Detect --> Reload[reloadConfig()<br/>1. Clear Cache<br/>2. Re-import Module<br/>3. Validate Config]

    Reload --> Validate{Validate?}

    Validate -->|Valid| Update[Update currentConfig<br/>emit 'config-reloaded' event]
    Validate -->|Invalid| Error[Keep old config<br/>Log error]

    Update --> Listen[Listeners receive<br/>config-reloaded event]
    Error --> Watch

    style Start fill:#e1f5e4
    style Update fill:#4caf50
    style Error fill:#f44336
    style Validate fill:#ff9800
```

## Plugin System

```mermaid
flowchart LR
    subgraph PluginHooks ["Plugin Lifecycle Hooks"]
        onConfigLoad[onConfigLoad]
        onBackendReady[onBackendReady]
        onLoopStart[onLoopStart]
        onLoopEnd[onLoopEnd]
        onTaskStart[onTaskStart]
        onTaskComplete[onTaskComplete]
        onTaskFailed[onTaskFailed]
    end

    subgraph Flow ["Execution Flow"]
        Load[Load Config] --> onConfigLoad --> Backend[Backend Ready] --> onBackendReady --> Loop[Loop Start] --> onLoopStart --> Task[Task Start] --> onTaskStart
    end

    subgraph Outcomes ["Task Outcomes"]
        Success[Success] --> onTaskComplete
        Failure[Failure] --> onTaskFailed
        LoopEnd[Loop End] --> onLoopEnd
    end

    Task --> Success
    Task --> Failure
    Loop --> LoopEnd

    style onConfigLoad fill:#1e88e5
    style onBackendReady fill:#1e88e5
    style onLoopStart fill:#43a047
    style onLoopEnd fill:#43a047
    style onTaskStart fill:#ff9800
    style onTaskComplete fill:#4caf50
    style onTaskFailed fill:#f44336
```

## Backend System

```mermaid
flowchart TD
    subgraph Backends ["Task Backends"]
        JSON[JsonTaskAdapter<br/>JSON Files]
        GitHub[GithubTaskAdapter<br/>GitHub Issues]
        Custom[Custom Backend<br/>User Implemented]
    end

    subgraph Interface ["TaskBackend Interface"]
        FindNext[findNextTask]
        GetTask[getTask]
        MarkCompleted[markCompleted]
        MarkFailed[markFailed]
        GetSubTasks[getSubTasks]
        CreateSubTask[createSubTask]
        GetDependencies[getDependencies]
        AreDependenciesMet[areDependenciesMet]
        ClaimTask[claimTask]
    end

    JSON --> Interface
    GitHub --> Interface
    Custom --> Interface

    style JSON fill:#e1f5e4
    style GitHub fill:#1565c0
    style Custom fill:#7b1fa2
```

## Task Execution Flow

```mermaid
flowchart TD
    Start([Start]) --> ConfigLoad[Apply plugins<br/>onConfigLoad]
    ConfigLoad --> BackendReady[Initialize backend<br/>onBackendReady]
    BackendReady --> LoopStart[onLoopStart]

    LoopStart --> Circuit{Circuit<br/>Breaker}

    Circuit -->|5 failures<br/>Self-heal| Heal[Self-healing attempt]
    Circuit -->|Open| FindTask[Find next pending task<br/>Apply filters]

    Heal --> FindTask

    FindTask --> TaskStart[onTaskStart hook]
    TaskStart --> Generate[Generate prompt<br/>PRD + success criteria]

    Generate --> Execute[Execute CLI<br/>Auto-retry<br/>Primary → Fallback]

    Execute --> Parse{Parse output}

    Parse -->|Success| Mark[Mark task completed<br/>onTaskComplete]
    Parse -->|Failure| Fail[Mark task failed<br/>onTaskFailed]
    Parse -->|Retry| Execute

    Mark --> External[Update external systems<br/>Asana, Todoist, etc.]
    Fail --> Continue[Continue loop]
    External --> Continue

    Continue --> LoopEnd{More tasks?}
    LoopEnd -->|Yes| FindTask
    LoopEnd -->|No| Finish[onLoopEnd]

    style Start fill:#e1f5e4
    style Finish fill:#4caf50
    style Mark fill:#4caf50
    style Fail fill:#f44336
    style Execute fill:#2196f3
```

## State Management

```mermaid
graph TD
    subgraph Directory ["Directory: .loopwork/"]
        State[state.json<br/>Current namespace state]
        Lock[state-default.lock<br/>File lock directory]
        ProdState[state-prod.json<br/>Production namespace]
        ProdLock[state-prod.lock<br/>Production lock]
        MonitorState[monitor-state.json<br/>Daemon tracking]
        RestartArgs[default-restart-args.json<br/>Saved arguments]
        Sessions[sessions/<br/>Session logs]
    end

    subgraph SessionStructure ["Session Directory: sessions/default/"]
        Log[loopwork.log<br/>Combined log]
        Logs[logs/<br/>Iteration logs]
        Iter1[iteration-1-prompt.md]
        Iter2[iteration-1-output.txt]
        Iter3[iteration-2-prompt.md]
        Iter4[iteration-2-output.txt]
    end

    State --> Lock
    ProdState --> ProdLock
    RestartArgs --> Sessions
    Sessions --> SessionStructure

    style State fill:#e1f5e4
    style Lock fill:#ff9800
    style MonitorState fill:#1e88e5
```

## Process Management

```mermaid
flowchart TD
    Spawn[loopwork spawn<br/>claude, opencode]

    Spawn --> Track[Track PID<br/>spawned-pids.json]

    Track --> Monitor{Process Monitor}

    Monitor -->|Pattern Check| Pattern[Detector<br/>Pattern Match]
    Monitor -->|Background| Periodic[Monitor<br/>Background Polling]
    Monitor -->|Auto-kill| AutoKill[Monitor<br/>Auto-kill]

    Pattern --> Detector[Detector<br/>Pattern Matcher]
    Periodic --> Detector
    AutoKill --> Killer

    Detector --> Match{Match Found?}

    Match -->|Yes| OrphanList[Orphan Process List<br/>confirmed: tracked<br/>suspected: pattern]

    Killer --> Action[Action: Kill with<br/>SIGTERM → SIGKILL]

    OrphanList --> Confirmed{Confirmed?}
    Confirmed -->|Yes| AlwaysKill[Always kill]
    Confirmed -->|No| ForceKill[Kill with force]

    Action --> AlwaysKill
    Action --> ForceKill

    AlwaysKill --> Log[Log to<br/>orphan-events.log]
    ForceKill --> Log

    style Spawn fill:#e1f5e4
    style Detector fill:#2196f3
    style Killer fill:#f44336
    style Match fill:#ff9800
    style Action fill:#1e88e5
```

## Orphan Detection

```mermaid
flowchart TD
    subgraph DetectionCriteria ["Detection Criteria"]
        DeadParent[Dead parent<br/>Parent PID no longer exists]
        Stale[Stale<br/>Running longer than<br/>2x timeout]
    end

    Detection[Orphan Detected]

    DeadParent --> Detection
    Stale --> Detection

    Detection --> Type{Type}

    Type -->|Dead Parent| Confirm[Confirmed orphan]
    Type -->|Stale| Suspect[Suspected orphan]

    Confirm --> AlwaysKill[Kill with SIGTERM → SIGKILL]
    Suspect --> ForceCheck[Kill only if<br/>force flag]

    AlwaysKill --> Cleanup[Cleanup<br/>Update state<br/>Log event]
    ForceCheck --> Cleanup

    style Detection fill:#ff9800
    style Confirm fill:#f44336
    style AlwaysKill fill:#f44336
    style ForceCheck fill:#ff9800
```

## AI Monitor & Self-Healing

```mermaid
flowchart TD
    subgraph AImonitor ["AI Monitor Components"]
        LogWatcher[LogWatcher<br/>Chokidar Events]
        PatternMatcher[PatternMatcher<br/>ErrorPatterns Registry]
        ActionExecutor[ActionExecutor<br/>CircuitBreaker Verification]
        WisdomSystem[WisdomSystem<br/>60%+ Match Category<br/>Healing]
    end

    LogWatcher --> PatternMatcher
    PatternMatcher --> Match{Pattern Match?}

    Match -->|No| LLM[LLM Analysis<br/>Throttled]
    Match -->|Yes| ActionExecutor

    LLM --> Verify[Verification Engine<br/>Check fix wisdom]
    ActionExecutor --> Verify

    Verify --> Wisdom{60%+ Match<br/>Category?}

    Wisdom -->|Yes| Apply[Apply category-specific<br/>healing strategy]
    Wisdom -->|No| Count[Count attempts]

    Apply --> Success{Success?}
    Count -->|3 attempts| Throw[Throw LoopworkError<br/>Stop]
    Count -->|< 3 attempts| NextTry[Try next attempt]

    Success -->|Yes| Log[Log wisdom<br/>Increment confidence]
    Success -->|No| NextTry
    Log --> Clear[Clear circuit<br/>breaker]

    NextTry --> LLM
    Clear --> Done([Done])

    style LogWatcher fill:#2196f3
    style PatternMatcher fill:#2196f3
    style WisdomSystem fill:#9c27b0
    style Apply fill:#4caf50
    style Throw fill:#f44336
    style Done fill:#4caf50
```

## Claude Plugin Architecture

```mermaid
graph TB
    subgraph ClaudeInstances ["Claude Instances (up to 10)"]
        C1[Claude #1<br/>Terminal]
        C2[Claude #2<br/>VSCode]
        C3[Claude #3<br/>CI Runner]
        CN[Claude #N<br/>...]
    end

    subgraph MCP ["Loopwork MCP Server"]
        State[In-Memory State<br/>instances, taskClaims<br/>fileLocks]
        FilePersistence[File Persistence<br/>.loopwork/coordinator-state.json]
        Tools[MCP Tools<br/>loopwork_register<br/>loopwork_claim_task<br/>loopwork_release_task<br/>loopwork_heartbeat<br/>loopwork_lock_file<br/>loopwork_unlock_file]
    end

    subgraph TaskBackend ["Task Backend"]
        JSONBackend[.specs/tasks/tasks.json]
        GitHub[GitHub Issues]
        Notion[Notion DB]
    end

    subgraph Dashboard ["Next.js Dashboard"]
        InstanceMonitor[Instance Monitor<br/>Active instances]
        TaskBoard[Task Board<br/>Kanban with claims]
        ActivityFeed[Activity Feed<br/>Recent actions]
    end

    C1 -.->|register| MCP
    C2 -.->|register| MCP
    C3 -.->|register| MCP
    CN -.->|register| MCP

    C1 -.->|claim_task| TaskBackend
    C2 -.->|claim_task| TaskBackend
    C3 -.->|claim_task| TaskBackend

    MCP -.->|persist| FilePersistence
    MCP -.->|real-time| Dashboard

    C1 -.->|heartbeat| MCP
    C2 -.->|heartbeat| MCP
    C3 -.->|heartbeat| MCP

    style ClaudeInstances fill:#d97706
    style MCP fill:#795548
    style TaskBackend fill:#1e88e5
    style Dashboard fill:#42a5f5
```

## Resource Pool Management

```mermaid
graph LR
    subgraph WorkerPools ["Worker Pools (Resource Isolation)"]
        High[high pool<br/>Size: 2<br/>Nice: 0<br/>Memory: 2048MB]
        Medium[medium pool<br/>Size: 5<br/>Nice: 5<br/>Memory: 1024MB]
        Low[low pool<br/>Size: 2<br/>Nice: 10<br/>Memory: 512MB]
        Background[background pool<br/>Size: 1<br/>Nice: 15<br/>Memory: 256MB]
    end

    Task[Task Priority/Feature] --> Assign{Assign to Pool}

    Assign -->|High Priority| High
    Assign -->|Medium Priority| Medium
    Assign -->|Low Priority| Low
    Assign -->|Background| Background

    High --> Execute[Execute with<br/>Resource Limits]
    Medium --> Execute
    Low --> Execute
    Background --> Execute

    Execute --> Monitor[ProcessResourceMonitor<br/>CPU & Memory]
    Monitor --> Limit{Exceeds<br/>Limit?}

    Limit -->|Yes| Kill[Graceful Termination<br/>SIGTERM → SIGKILL]
    Limit -->|No| Continue[Continue Execution]

    Kill --> Done([Task Failed])
    Continue --> Done([Task Complete])

    style High fill:#f44336
    style Medium fill:#ff9800
    style Low fill:#ffeb3b
    style Background fill:#4caf50
    style Execute fill:#2196f3
```

## Output System Architecture

```mermaid
flowchart TD
    subgraph OutputSystem ["Output System Components"]
        Renderer[Base Renderer<br/>Abstract class]
        InkRenderer[Ink Renderer<br/>React-based TUI]
        ConsoleRenderer[Console Renderer<br/>Fallback with Ora]
        EventEmitter[Event Emitter<br/>Subscriber management]
        Logger[Logger<br/>Log levels]
    end

    Event[Event Occurred]

    Event --> Filter{shouldLog<br/>Check Log Level}

    Filter -->|Yes| Emit[Renderer.render<br/>Concrete implementation]
    Filter -->|No| Discard[Discard event]

    Emit --> Notify[notifySubscribers<br/>Notify all listeners]

    Renderer --> Ink[InkApp.tsx<br/>Main React Component]
    ConsoleRenderer --> Console

    Notify --> Update[UI Updates<br/>Real-time feedback]

    style Renderer fill:#2196f3
    style InkRenderer fill:#42a5f5
    style ConsoleRenderer fill:#7b1fa2
    style Filter fill:#ff9800
    style Emit fill:#4caf50
```

## File Locking Pattern

```mermaid
sequenceDiagram
    participant Process1 as Process 1
    participant Process2 as Process 2
    participant LockFile as Lock File
    participant TasksFile as tasks.json

    Process1->>LockFile: Acquire lock<br/>(write PID)
    LockFile-->>Process1: Lock granted
    Process1->>TasksFile: Read tasks
    Process1->>TasksFile: Mark task in-progress<br/>(atomic write)
    Process1-->>LockFile: Release lock

    Note over Process1,LockFile: Lock file contains PID<br/>Stale locks (>30s) are removed

    Process1->>LockFile: Acquire lock
    LockFile-->>Process1: Lock granted

    Process2->>LockFile: Acquire lock
    Note over Process2,LockFile: Blocked until Process 1 releases
    LockFile--xProcess2: Lock denied (stale detection)

    Process1->>TasksFile: Mark task completed
    Process1-->>LockFile: Release lock

    LockFile-->>Process2: Now available<br/>(retry succeeds)

    Note over Process2,LockFile: 100ms retry interval<br/>5s timeout

## Parallel Execution Architecture

```mermaid
flowchart TD
    Start([Start Parallel Run]) --> Config{Config<br/>workers=N}
    Config --> Pool[Worker Pool<br/>(Promise.allSettled)]

    subgraph WorkerLoop ["Worker Loop (xN)"]
        Find[backend.claimTask()] --> Claimed{Task Found?}
        Claimed -->|No| Wait[Wait taskDelay]
        Claimed -->|Yes| Execute[cliExecutor.executeTask()]

        Execute --> Result{Exit Code}
        Result -->|0| Success[backend.markCompleted()]
        Result -->|!=0| Failure[backend.markFailed()]

        Success --> Report[Update Stats]
        Failure --> Report
        Report --> CheckLimit{Max Iterations?}
        CheckLimit -->|No| Find
        CheckLimit -->|Yes| StopWorker([Stop Worker])
    end

    Pool --> WorkerLoop
    WorkerLoop --> Done([All Workers Done])

    subgraph Resilience ["Resilience Layer"]
        Circuit[Circuit Breaker]
        Healing[Self-Healing]
        Checkpoint[CheckpointIntegrator]
    end

    Failure --> Circuit
    Circuit -->|Threshold met| Healing
    Report --> Checkpoint
```

