# Loopwork Output API Inventory

This document provides a comprehensive inventory of the legacy output API surface in `packages/loopwork/src/core/output.ts`. This inventory ensures 100% API compatibility during the Ink-based React component rewrite.

## 📋 Overview
The `output.ts` module provides unified output utilities for the Loopwork CLI, including tables, banners, progress bars, and emoji handling. It is designed to be TTY-aware, falling back to plain text in non-interactive environments.

---

## 🏗️ Exported Classes

### 1. `Table`
Box-drawing class for rendering Unicode tables.

**Contract:**
- `constructor(headers: string[], columnConfigs?: ColumnConfig[])`
  - `headers`: Array of column titles.
  - `columnConfigs`: Optional array of `{ width?: number; align?: 'left' | 'right' | 'center' }`.
- `addRow(cells: string[]): void`
  - Throws error if `cells.length` doesn't match `headers.length`.
  - Automatically updates `columnWidths` based on content (stripping ANSI codes for length calculation).
- `render(): string`
  - Returns a multi-line string with Unicode box-drawing characters (`┌`, `─`, `┬`, etc.).

**Edge Cases:**
- ANSI codes are stripped when calculating column widths to ensure proper alignment.
- Handles empty tables gracefully (renders header + borders).

**Call Sites:**
- `packages/loopwork/src/commands/deadletter.ts`: Used to list quarantined tasks.
- `packages/loopwork/examples/output-demo.ts`: Demonstration usage.
- `packages/loopwork/test/core/output.test.ts`: Unit tests.

---

### 2. `Banner`
Visual announcement box for startup or completion messages.

**Contract:**
- `constructor(title: string, style: 'light' | 'heavy' = 'heavy')`
  - `title`: Central title of the banner.
  - `style`: Box-drawing style (heavy `═` or light `─`).
- `addRow(key: string, value: string): void`
  - Adds a key-value pair line to the banner body.
- `render(): string`
  - Returns a multi-line formatted string with Cyan borders and Bold White title.

**Edge Cases:**
- Minimum width of 40 characters.
- Automatically centers the title.
- Strips ANSI codes for internal width calculations.

**Call Sites:**
- `packages/loopwork/src/core/output.ts`: Used internally by `CompletionSummary`.
- `packages/loopwork/examples/output-demo.ts`: Demonstration usage.
- `packages/loopwork/test/core/output.test.ts`: Unit tests.

---

### 3. `ProgressBar`
Progress tracking utility with TTY detection.

**Contract:**
- `constructor(total?: number)`
  - `total`: Total units for deterministic mode. If `0` or `undefined`, operates in indeterminate (spinner) mode.
- `increment(): void`
  - Increases current progress by 1.
- `tick(message?: string): void`
  - Renders the current progress bar or spinner.
  - Throttled to 50ms to prevent terminal flickering.
- `complete(message?: string): void`
  - Finalizes the progress bar, clearing the current line and printing a success checkmark `✓`.

**Edge Cases:**
- **Non-TTY**: In non-TTY environments, it logs simple progress lines (e.g., `Progress: 5/10 (50%) - Processing`) instead of overwriting the line.
- **Indeterminate**: Displays a cyclic spinner frames `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`.

**Call Sites:**
- `packages/loopwork/src/core/output.ts`: Source implementation.
- `packages/loopwork/test/core/output.test.ts`: Unit tests.
- Note: Many areas have migrated to the `ProgressBar` component in `src/components/ProgressBar.tsx`.

---

### 4. `CompletionSummary`
High-level summary formatter for task loops.

**Contract:**
- `constructor(title: string)`
- `setStats(stats: { completed?, failed?, skipped?, isDegraded?, disabledPlugins? }): void`
- `setDuration(ms: number): void`
- `addNextStep(step: string): void`
- `addNextSteps(steps: string[]): void`
- `render(): string`
  - In TTY: Renders as a `Banner` with Cyan borders.
  - In non-TTY: Renders as plain text with `===` underline.

**Edge Cases:**
- Human-readable duration formatting (e.g., `2h 15m`, `5m 30s`, `45s`).
- Displays "⚡ REDUCED/DEGRADED MODE" if `isDegraded` is true.

**Call Sites:**
- `packages/loopwork/src/core/output.ts`: Source implementation.
- `packages/loopwork/test/core/output.test.ts`: Unit tests.

---

## 🛠️ Exported Functions

### 1. `separator(type: 'light' | 'heavy' | 'section' = 'light', width?: number): string`
Creates a horizontal divider.
- `section`: Newline + light divider + newline.
- `light`: `─` repeat.
- `heavy`: `═` repeat.
- Width defaults to `process.stdout.columns` or 120.

**Call Sites:**
- `packages/loopwork/src/commands/run.tsx`
- `packages/loopwork/src/commands/status.ts`
- `packages/loopwork/src/commands/logs.tsx`
- `packages/loopwork/src/commands/monitor.tsx`

### 2. `supportsEmoji(): boolean`
Detects terminal emoji capability.
- Returns `false` if not TTY.
- Returns `true` on modern Windows (detected via `process.release`).
- Returns `true` on Unix if `TERM` is set and not `dumb`.

**Call Sites:**
- `packages/loopwork/src/core/output.ts` (internal)
- `packages/loopwork/src/core/utils.ts` (re-export)

### 3. `getEmoji(emoji: string): string`
Returns the emoji or a text fallback if `supportsEmoji()` is false.
- `✅` → `[OK]`
- `❌` → `[ERR]`
- `⚠️` → `[WARN]`
- `→` → `->`
- `✓` → `[+]`

**Call Sites:**
- `packages/loopwork/src/commands/status.ts`
- `packages/loopwork/src/core/output.ts` (internal)

### 4. `createJsonOutput(command: string, data: Record<string, unknown>): string`
Wraps command output in a structured JSON object with a timestamp.
- **Note**: No direct usages found in the current codebase.

### 5. `emitJsonEvent(type, command, data): void`
Writes a newline-delimited JSON event to `stdout`.
- **Note**: While exported, core commands like `run.tsx` often implement their own `emitJsonEvent` to better integrate with their local logger and state.

---

## 💎 Constants

### `BOX_CHARS`
Unicode box-drawing characters for `light` and `heavy` styles.

---

## 🗺️ Call Site Mapping (Summary)

| Utility | Primary Call Sites |
|:---|:---|
| **Table** | `deadletter.ts`, `output.test.ts`, `output-demo.ts` |
| **Banner** | `output.ts` (internal), `output.test.ts` |
| **ProgressBar** | `output.test.ts` |
| **CompletionSummary** | `output.ts` (internal), `output.test.ts` |
| **separator** | `run.tsx`, `status.ts`, `logs.tsx`, `monitor.tsx`, `decompose.tsx` |
| **getEmoji** | `status.ts`, `output.ts` |
| **createJsonOutput** | CLI command handlers (JSON mode) |
| **emitJsonEvent** | StreamLogger, CLI process events |
