import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  trackSpawnedPid,
  untrackPid,
  getTrackedPids,
  type OrphanProcess,
} from '../src/core/orphan-detector'
import { OrphanKiller, type KillOptions, type KillFunction } from '../src/core/orphan-killer'
import { LoopworkMonitor } from '../src/monitor'
