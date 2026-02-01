# Loopwork Documentation Structure

This document defines the standard structure for Loopwork documentation, following the [Diataxis](https://diataxis.fr/) framework.

## Directory Structure

All documentation should be centralized in the `docs/` directory at the repository root.

```
docs/
├── tutorials/       # Learning-oriented lessons (Step-by-step)
│   ├── getting-started.md
│   └── creating-first-task.md
├── guides/          # Problem-oriented how-to guides
│   ├── creating-plugins.md
│   ├── configuration.md
│   └── debugging.md
├── reference/       # Information-oriented technical reference
│   ├── cli-commands.md
│   ├── config-options.md
│   ├── plugin-api.md
│   └── architecture.md
└── explanation/     # Understanding-oriented background
    ├── architecture-overview.md
    ├── plugin-system.md
    └── cli-execution-model.md
```

## Content Guidelines

### 1. Tutorials (Learning)
- **Goal**: Help the user acquire a skill.
- **Style**: Instructional, step-by-step.
- **Example**: "Build your first Loopwork plugin in 5 minutes."

### 2. How-to Guides (Tasks)
- **Goal**: Help the user solve a specific problem.
- **Style**: Practical, action-oriented.
- **Example**: "How to enable cost tracking", "How to sync with Asana".

### 3. Reference (Information)
- **Goal**: Describe the machinery.
- **Style**: Technical, descriptive, accurate.
- **Example**: "CLI Command Reference", "Configuration Schema".

### 4. Explanation (Understanding)
- **Goal**: Explain the context and design.
- **Style**: Discursive, clarifying.
- **Example**: "How the CLI execution algorithm works", "Orphan process management".

## Migration Plan

Existing documentation from `README.md` and `packages/loopwork/README.md` should be migrated into this structure:

- **Getting Started** section -> `docs/tutorials/getting-started.md`
- **Plugin Development Guide** -> `docs/guides/creating-plugins.md`
- **CLI Usage** -> `docs/reference/cli-commands.md`
- **Architecture** -> `docs/explanation/architecture-overview.md`
