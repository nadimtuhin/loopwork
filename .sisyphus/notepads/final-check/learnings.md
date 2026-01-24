## Build Fixes
- Added `exports` to `packages/loopwork/package.json` to allow `import from 'loopwork/contracts'`. This was causing DTS build failures in `@loopwork/dashboard`.
- Root build script uses `bun run --filter './packages/*' build`.
- Dashboard web build requires explicit `bun run build:web` (or filter `@loopwork/dashboard`).
