import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import path from 'path'
import fs from 'fs'
import { loadDynamicPlugins } from '../src/core/plugin-loader'
import { withDynamicPlugins } from '../src/plugins/loader'
import { defineConfig } from '../src/plugins/index'

// Use a unique directory for this test run to avoid conflicts
const TMP_DIR = path.join(process.cwd(), 'packages/loopwork/test/tmp-plugins-' + Date.now())

describe('Dynamic Plugins', () => {
  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true })
    }
  })

  test('withDynamicPlugins adds to config', () => {
    const config = withDynamicPlugins(['plugin-a'])(defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' }
    }))
    expect(config.dynamicPlugins).toEqual(['plugin-a'])
  })

  test('loadDynamicPlugins loads plugin from file', async () => {
    const pluginPath = path.join(TMP_DIR, 'my-plugin.ts')
    const pluginCode = `
      export default function createPlugin() {
        return {
          name: 'test-dynamic-plugin',
          onLoopStart: () => console.log('started')
        }
      }
    `
    fs.writeFileSync(pluginPath, pluginCode)

    const plugins = await loadDynamicPlugins([pluginPath], process.cwd())
    expect(plugins).toHaveLength(1)
    expect(plugins[0].name).toBe('test-dynamic-plugin')
  })
  
  test('loadDynamicPlugins handles object export', async () => {
    const pluginPath = path.join(TMP_DIR, 'obj-plugin.ts')
    const pluginCode = `
      export default {
        name: 'test-obj-plugin',
        onLoopStart: () => {}
      }
    `
    fs.writeFileSync(pluginPath, pluginCode)

    const plugins = await loadDynamicPlugins([pluginPath], process.cwd())
    expect(plugins).toHaveLength(1)
    expect(plugins[0].name).toBe('test-obj-plugin')
  })
})
