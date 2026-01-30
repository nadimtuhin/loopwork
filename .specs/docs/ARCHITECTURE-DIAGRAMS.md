# Architecture Diagrams: oh-my-claudecode & oh-my-opencode

## 1. oh-my-claudecode Architecture

### 1.1 Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLAUDE CODE (CLI)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        HOOK SYSTEM                                      │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │ │
│  │  │SessionStart  │ │UserPrompt    │ │PreToolUse    │ │PostToolUse   │  │ │
│  │  │              │ │Submit        │ │              │ │              │  │ │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘  │ │
│  │         │                │                │                │          │ │
│  │  ┌──────┴───────┐ ┌──────┴───────┐ ┌──────┴───────┐ ┌──────┴───────┐  │ │
│  │  │Stop          │ │SubagentStop  │ │PreCompact    │ │SessionEnd    │  │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                     │                                        │
│                                     ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    OH-MY-CLAUDECODE PLUGIN                              │ │
│  │                                                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │              THREE-LAYER SKILL COMPOSITION                       │   │ │
│  │  │                                                                   │   │ │
│  │  │  ┌─────────────────────────────────────────────────────────┐    │   │ │
│  │  │  │  GUARANTEE LAYER (Optional)                              │    │   │ │
│  │  │  │  ralph: "Cannot stop until verified done"                │    │   │ │
│  │  │  └──────────────────────────┬──────────────────────────────┘    │   │ │
│  │  │                              ▼                                   │   │ │
│  │  │  ┌─────────────────────────────────────────────────────────┐    │   │ │
│  │  │  │  ENHANCEMENT LAYER (0-N Skills)                          │    │   │ │
│  │  │  │  ultrawork | git-master | frontend-ui-ux | tdd           │    │   │ │
│  │  │  └──────────────────────────┬──────────────────────────────┘    │   │ │
│  │  │                              ▼                                   │   │ │
│  │  │  ┌─────────────────────────────────────────────────────────┐    │   │ │
│  │  │  │  EXECUTION LAYER (Primary)                               │    │   │ │
│  │  │  │  default | orchestrate | planner                         │    │   │ │
│  │  │  └─────────────────────────────────────────────────────────┘    │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │              EXECUTION MODES                                     │   │ │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐       │   │ │
│  │  │  │ autopilot │ │ ultrawork │ │   ralph   │ │ ultrapilot│       │   │ │
│  │  │  │ (auto E2E)│ │ (parallel)│ │(persist)  │ │(parallel  │       │   │ │
│  │  │  │           │ │           │ │           │ │ autopilot)│       │   │ │
│  │  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘       │   │ │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐                     │   │ │
│  │  │  │   swarm   │ │ pipeline  │ │  ecomode  │                     │   │ │
│  │  │  │ (N agents)│ │(sequential│ │ (token-   │                     │   │ │
│  │  │  │           │ │ chain)    │ │ efficient)│                     │   │ │
│  │  │  └───────────┘ └───────────┘ └───────────┘                     │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                     │                                        │
│                                     ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     32 SPECIALIZED AGENTS                               │ │
│  │                                                                          │ │
│  │   LOW (Haiku)         MEDIUM (Sonnet)         HIGH (Opus)              │ │
│  │  ┌─────────────┐     ┌─────────────┐        ┌─────────────┐           │ │
│  │  │executor-low │     │  executor   │        │executor-high│           │ │
│  │  │explore      │     │explore-med  │        │explore-high │           │ │
│  │  │writer       │     │  designer   │        │designer-high│           │ │
│  │  │architect-low│     │architect-med│        │  architect  │           │ │
│  │  │researcher-lo│     │ researcher  │        │   planner   │           │ │
│  │  │build-fixer-l│     │ build-fixer │        │   critic    │           │ │
│  │  │security-rev-│     │  qa-tester  │        │security-rev │           │ │
│  │  │tdd-guide-low│     │  tdd-guide  │        │qa-tester-hi │           │ │
│  │  │code-review-l│     │  scientist  │        │code-reviewer│           │ │
│  │  │scientist-low│     │   vision    │        │scientist-hi │           │ │
│  │  └─────────────┘     └─────────────┘        └─────────────┘           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Hook Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HOOK LIFECYCLE                                     │
└─────────────────────────────────────────────────────────────────────────────┘

User Input
    │
    ▼
┌───────────────────┐
│  SessionStart     │──────► Initialize OMC, check active modes
└───────────────────┘
    │
    ▼
┌───────────────────┐
│ UserPromptSubmit  │──────► Keyword detection (ulw, ralph, eco, etc.)
└───────────────────┘        Auto-activate skills
    │
    ▼
┌───────────────────┐
│   PreToolUse      │──────► Validate arguments
└───────────────────┘        Permission checks
    │                        Auto-approval logic
    ▼
┌───────────────────┐
│  [Tool Executes]  │
└───────────────────┘
    │
    ▼
┌───────────────────┐
│  PostToolUse      │──────► State updates
└───────────────────┘        Verification triggers
    │
    ▼
┌───────────────────┐       ┌───────────────────┐
│      Stop         │──────►│ Ralph Check:      │
└───────────────────┘       │ All tasks done?   │
    │                       │ Verification pass?│
    │                       └─────────┬─────────┘
    │                                 │
    │          ┌──────────────────────┼──────────────────────┐
    │          │                      │                      │
    │          ▼                      ▼                      ▼
    │    ┌──────────┐           ┌──────────┐          ┌──────────┐
    │    │   YES    │           │    NO    │          │ BLOCKED  │
    │    │Allow Exit│           │ Continue │          │Ask Oracle│
    │    └──────────┘           └──────────┘          └──────────┘
    │
    ▼
┌───────────────────┐
│   SessionEnd      │──────► Cleanup, final reporting
└───────────────────┘
```

### 1.3 Ultrawork Parallel Execution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ULTRAWORK MODE ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

                            User: "ulw fix all errors"
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │    Keyword Detector    │
                         │ Activates Ultrawork    │
                         └────────────┬───────────┘
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │    Task Decomposer     │
                         │ Creates shared pool    │
                         └────────────┬───────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
    ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
    │    Worker 1     │     │    Worker 2     │     │    Worker N     │
    │  (background)   │     │  (background)   │     │  (background)   │
    └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
             │                       │                       │
             ▼                       ▼                       ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      SHARED TASK POOL                            │
    │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
    │  │ Task A  │ │ Task B  │ │ Task C  │ │ Task D  │ │ Task E  │   │
    │  │ pending │ │ claimed │ │ claimed │ │ pending │ │  done   │   │
    │  │         │ │Worker 1 │ │Worker 2 │ │         │ │         │   │
    │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
    └─────────────────────────────────────────────────────────────────┘
             │                       │                       │
             └───────────────────────┼───────────────────────┘
                                     │
                                     ▼
                         ┌────────────────────────┐
                         │   Completion Check     │
                         │  All tasks done?       │
                         └────────────┬───────────┘
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │     Verification       │
                         │  BUILD + TEST + LINT   │
                         └────────────────────────┘
```

### 1.4 State Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STATE MANAGEMENT                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Project Directory
│
├── .omc/
│   ├── state/
│   │   ├── ultrawork-state.json      # Parallel execution state
│   │   ├── ralph-state.json          # Persistence loop state
│   │   ├── ultrapilot-state.json     # Parallel autopilot state
│   │   ├── ultrapilot-ownership.json # File ownership tracking
│   │   ├── swarm-state.json          # Multi-agent coordination
│   │   └── skill-sessions.json       # Active skill sessions
│   │
│   ├── notepads/
│   │   └── {plan-name}/
│   │       ├── learnings.md          # Technical discoveries
│   │       ├── decisions.md          # Architectural decisions
│   │       ├── issues.md             # Known issues
│   │       └── problems.md           # Blockers
│   │
│   └── logs/
│       └── delegation-audit.jsonl    # Delegation tracking
│
└── .claude/
    ├── skills/
    │   └── *.md                      # Skill definitions
    ├── todos/
    │   └── *.json                    # Task tracking
    └── CLAUDE.md                     # Instructions

Global State (~/.omc/)
│
└── state/
    └── {name}.json                   # User-wide state
```

---

## 2. oh-my-opencode Architecture

### 2.1 Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            OPENCODE (CLI)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         HOOK SYSTEM (31+ Hooks)                         │ │
│  │                                                                          │ │
│  │  Chat Hooks          Tool Hooks           Session Hooks                 │ │
│  │  ┌───────────┐      ┌───────────┐        ┌───────────┐                 │ │
│  │  │chat.msg   │      │pre-tool   │        │session.*  │                 │ │
│  │  │keyword-det│      │post-tool  │        │compaction │                 │ │
│  │  │context-inj│      │output-trunc│       │recovery   │                 │ │
│  │  └───────────┘      └───────────┘        └───────────┘                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                     │                                        │
│                                     ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      OH-MY-OPENCODE PLUGIN                              │ │
│  │                                                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │              THREE-LAYER ORCHESTRATION                           │   │ │
│  │  │                                                                   │   │ │
│  │  │  ┌─────────────────────────────────────────────────────────┐    │   │ │
│  │  │  │  LAYER 1: PLANNING (Strategic)                           │    │   │ │
│  │  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐              │    │   │ │
│  │  │  │  │Prometheus │ │   Metis   │ │   Momus   │              │    │   │ │
│  │  │  │  │(Planner)  │ │(Analyzer) │ │(Validator)│              │    │   │ │
│  │  │  │  │Opus 4.5   │ │Sonnet 4.5 │ │Sonnet 4.5 │              │    │   │ │
│  │  │  │  └───────────┘ └───────────┘ └───────────┘              │    │   │ │
│  │  │  └──────────────────────────┬──────────────────────────────┘    │   │ │
│  │  │                              ▼                                   │   │ │
│  │  │  ┌─────────────────────────────────────────────────────────┐    │   │ │
│  │  │  │  LAYER 2: EXECUTION (Coordination)                       │    │   │ │
│  │  │  │  ┌─────────────────────────────────────────────────┐    │    │   │ │
│  │  │  │  │                    ATLAS                         │    │    │   │ │
│  │  │  │  │              (Master Orchestrator)               │    │    │   │ │
│  │  │  │  │                   Opus 4.5                       │    │    │   │ │
│  │  │  │  │  - Reads plans, analyzes dependencies            │    │    │   │ │
│  │  │  │  │  - Delegates work, NEVER executes directly       │    │    │   │ │
│  │  │  │  │  - Independently verifies all results            │    │    │   │ │
│  │  │  │  │  - "Never trust subagent claims"                 │    │    │   │ │
│  │  │  │  └─────────────────────────────────────────────────┘    │    │   │ │
│  │  │  └──────────────────────────┬──────────────────────────────┘    │   │ │
│  │  │                              ▼                                   │   │ │
│  │  │  ┌─────────────────────────────────────────────────────────┐    │   │ │
│  │  │  │  LAYER 3: WORKERS (Execution)                            │    │   │ │
│  │  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐              │    │   │ │
│  │  │  │  │Sisyphus-  │ │ Specialist│ │ Specialist│              │    │   │ │
│  │  │  │  │Junior     │ │  Agent A  │ │  Agent B  │              │    │   │ │
│  │  │  │  │Sonnet 4.5 │ │           │ │           │              │    │   │ │
│  │  │  │  └───────────┘ └───────────┘ └───────────┘              │    │   │ │
│  │  │  └─────────────────────────────────────────────────────────┘    │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Planning Triad Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PLANNING TRIAD WORKFLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                              User: "@plan new feature"
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │      PROMETHEUS        │
                          │    (Strategic Planner) │
                          │      Claude Opus       │
                          └────────────┬───────────┘
                                       │
                     ┌─────────────────┼─────────────────┐
                     │                 │                 │
                     ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │   Interview  │  │   Research   │  │    Draft     │
            │     Mode     │  │  Codebase    │  │   Recording  │
            └──────────────┘  └──────────────┘  └──────────────┘
                     │                 │                 │
                     └─────────────────┼─────────────────┘
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │        METIS           │
                          │   (Gap Analyzer)       │
                          │    Claude Sonnet       │
                          │                        │
                          │ - Hidden intentions    │
                          │ - Ambiguities          │
                          │ - AI failure points    │
                          └────────────┬───────────┘
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │        MOMUS           │
                          │   (Plan Validator)     │
                          │    Claude Sonnet       │
                          │                        │
                          │ Validates:             │
                          │ - Clarity              │
                          │ - Verifiability        │
                          │ - Completeness         │
                          │ - Context sufficiency  │
                          └────────────┬───────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
           ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
           │    REJECT    │   │   APPROVE    │   │   ITERATE    │
           │   (Revise)   │   │              │   │  (Improve)   │
           └──────────────┘   └──────┬───────┘   └──────────────┘
                                     │
                                     ▼
                          ┌────────────────────────┐
                          │  .sisyphus/plans/      │
                          │    {name}.md           │
                          └────────────┬───────────┘
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │    /start-work         │
                          │  (Handoff to Atlas)    │
                          └────────────────────────┘
```

### 2.3 Atlas Delegation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ATLAS DELEGATION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                          ┌────────────────────────┐
                          │        ATLAS           │
                          │  (Master Orchestrator) │
                          └────────────┬───────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
    │  Read Plan      │      │  Build Parallel │      │  Extract Wisdom │
    │                 │      │  Map            │      │  from Notepads  │
    └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
             │                        │                        │
             └────────────────────────┼────────────────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │  7-SECTION PROMPT      │
                          │  CONSTRUCTION          │
                          │                        │
                          │  1. TASK               │
                          │  2. EXPECTED OUTCOME   │
                          │  3. REQUIRED SKILLS    │
                          │  4. REQUIRED TOOLS     │
                          │  5. MUST DO            │
                          │  6. MUST NOT DO        │
                          │  7. CONTEXT + WISDOM   │
                          └────────────┬───────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
    │  Sisyphus-Jr    │      │   Designer      │      │   Executor      │
    │  (Background)   │      │   (Background)  │      │   (Background)  │
    └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
             │                        │                        │
             └────────────────────────┼────────────────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │  INDEPENDENT           │
                          │  VERIFICATION          │
                          │                        │
                          │  - lsp_diagnostics     │
                          │  - Run test suite      │
                          │  - Read modified files │
                          │                        │
                          │  "Never trust          │
                          │   subagent claims"     │
                          └────────────┬───────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
           ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
           │    PASS      │   │    FAIL      │   │   PARTIAL    │
           │  (Complete)  │   │  (Re-assign) │   │  (Continue)  │
           └──────────────┘   └──────────────┘   └──────────────┘
```

### 2.4 Background Task Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   BACKGROUND TASK MANAGEMENT                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                          ┌────────────────────────┐
                          │  BACKGROUND MANAGER    │
                          │                        │
                          │  Max Concurrent: 5     │
                          │  Stale Detection: 3min │
                          │  TTL: 30min            │
                          └────────────┬───────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│  CONCURRENCY    │          │  TASK LIFECYCLE │          │  MONITORING     │
│  MANAGER        │          │                 │          │                 │
│                 │          │  pending        │          │  Event-driven   │
│  Per-Provider:  │          │     ↓           │          │      +          │
│  - anthropic: 3 │          │  running        │          │  2s polling     │
│  - openai: 5    │          │     ↓           │          │                 │
│  - google: 10   │          │  completed/err  │          │  (dual approach)│
│                 │          │                 │          │                 │
│  Per-Model:     │          │                 │          │                 │
│  - opus: 2      │          │                 │          │                 │
└────────┬────────┘          └────────┬────────┘          └────────┬────────┘
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │   SLOT MANAGEMENT      │
                          │                        │
                          │   acquire(key)         │
                          │       │                │
                          │       ▼                │
                          │   [Execute Task]       │
                          │       │                │
                          │       ▼                │
                          │   release(key)         │
                          │                        │
                          │   Queue waiting tasks  │
                          └────────────────────────┘
```

### 2.5 Category + Skill System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CATEGORY + SKILL SYSTEM                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                     ┌─────────────────────────────────────┐
                     │         DELEGATION REQUEST          │
                     │  delegate_task(category, prompt)    │
                     └─────────────────┬───────────────────┘
                                       │
                                       ▼
                     ┌─────────────────────────────────────┐
                     │       CATEGORY RESOLUTION           │
                     └─────────────────┬───────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│ visual-         │          │   ultrabrain    │          │     quick       │
│ engineering     │          │                 │          │                 │
│                 │          │                 │          │                 │
│ Model: Gemini   │          │ Model: GPT-5.2  │          │ Model: Haiku    │
│ Temp: 0.7       │          │ Temp: 0.3       │          │ Temp: 0.1       │
│ Thinking: high  │          │ Thinking: max   │          │ Thinking: low   │
│                 │          │                 │          │                 │
│ For: UI/UX,     │          │ For: Complex    │          │ For: Lookups,   │
│ design systems  │          │ reasoning       │          │ simple ops      │
└─────────────────┘          └─────────────────┘          └─────────────────┘
         │                             │                             │
         └─────────────────────────────┼─────────────────────────────┘
                                       │
                                       ▼
                     ┌─────────────────────────────────────┐
                     │         SKILL INJECTION             │
                     │                                     │
                     │  Skills add domain expertise:       │
                     │  - playwright (browser automation)  │
                     │  - git-master (git operations)      │
                     │  - testing (test writing)           │
                     └─────────────────┬───────────────────┘
                                       │
                                       ▼
                     ┌─────────────────────────────────────┐
                     │      CONFIGURED AGENT CALL          │
                     │                                     │
                     │  Model + Temperature + Thinking     │
                     │  + Prompt Additions + Skills        │
                     └─────────────────────────────────────┘
```

### 2.6 State & Wisdom Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STATE & WISDOM MANAGEMENT                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Project Directory
│
├── .sisyphus/
│   ├── plans/
│   │   └── {plan-name}.md            # Generated plans
│   │
│   ├── drafts/
│   │   └── {draft-name}.md           # Interview drafts
│   │
│   └── notepads/
│       └── {plan-name}/
│           ├── learnings.md          # Successful patterns
│           ├── decisions.md          # Architectural choices
│           ├── issues.md             # Encountered problems
│           └── problems.md           # Workarounds
│
├── .omc/
│   └── state/
│       └── boulder.json              # Session state
│           {
│             "currentPlan": "feature-x",
│             "sessionId": "abc-123",
│             "currentTask": 3,
│             "completedTasks": [1, 2]
│           }
│
└── oh-my-opencode.json               # Configuration
    {
      "sisyphus_agent": "planner_enabled",
      "concurrency": {
        "default": 3,
        "providers": {...}
      }
    }

Wisdom Flow:
┌────────────┐     ┌────────────┐     ┌────────────┐
│  Task 1    │────►│  Notepad   │────►│  Task 2    │
│  Completes │     │  Updated   │     │  Receives  │
│            │     │            │     │  Wisdom    │
└────────────┘     └────────────┘     └────────────┘
```

---

## 3. Comparison Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE COMPARISON                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                oh-my-claudecode              oh-my-opencode
                ===============              ================

Orchestration   Skill Composition            Agent Hierarchy
Model           (Guarantee + Enhancement     (Prometheus → Atlas
                 + Execution layers)          → Junior)

Planning        Planner skill with           Prometheus + Metis +
                optional interview           Momus (Planning Triad)

Execution       Ultrawork (parallel tasks)   Atlas (never executes,
                Swarm (N agents)             only delegates)
                Pipeline (sequential)

Workers         32 tiered agents             Sisyphus-Junior +
                (Haiku/Sonnet/Opus)          Specialist agents

Persistence     Ralph loop with              boulder.json session
                Stop hook verification       state + auto-resume

Background      Max 5 concurrent             Per-provider/model
Tasks           run_in_background: true      concurrency limits

Model Routing   Delegation Categories        Category + Skill
                (auto-detect from prompt)    (semantic mapping)

State Location  .omc/state/                  .sisyphus/ + .omc/

Wisdom          .omc/notepads/               .sisyphus/notepads/

Verification    Verification Engine          Independent verification
                (BUILD/TEST/LINT/ARCH)       (lsp_diagnostics + tests)

Key Principle   "CONDUCTOR, not performer"   "Never trust subagent
                                              claims"
```
