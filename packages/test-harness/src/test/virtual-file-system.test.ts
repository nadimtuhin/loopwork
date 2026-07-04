import { describe, expect, test, beforeEach } from 'bun:test'
import { VirtualFileSystem } from '../mocks/fs'

describe('VirtualFileSystem', () => {
  let vfs: VirtualFileSystem

  beforeEach(() => {
    vfs = new VirtualFileSystem('test-vfs')
  })

  test('should instantiate correctly', () => {
    expect(vfs).toBeDefined()
    expect(vfs.id).toBe('test-vfs')
  })

  test('should write and read files', () => {
    vfs.writeFile('/test.txt', 'hello world')
    expect(vfs.exists('/test.txt')).toBe(true)
    expect(vfs.readFile('/test.txt')).toBe('hello world')
  })

  test('should handle directories', () => {
    vfs.mkdir('/dir', { recursive: true })
    expect(vfs.exists('/dir')).toBe(true)
    expect(vfs.stat('/dir').isDirectory).toBe(true)

    vfs.writeFile('/dir/file.txt', 'content')
    expect(vfs.readdir('/dir')).toEqual(['file.txt'])
  })

  test('should delete files and directories', () => {
    vfs.writeFile('/delete.txt', 'content')
    vfs.delete('/delete.txt')
    expect(vfs.exists('/delete.txt')).toBe(false)

    vfs.mkdir('/delete-dir')
    vfs.delete('/delete-dir')
    expect(vfs.exists('/delete-dir')).toBe(false)
  })

  test('should support async operations', async () => {
    await vfs.writeFileAsync('/async.txt', 'async content')
    const content = await vfs.readFileAsync('/async.txt')
    expect(content).toBe('async content')
  })

  test('should support recursive copy', () => {
    vfs.createMockProject({
      '/src/file1.txt': 'content1',
      '/src/subdir/file2.txt': 'content2'
    })
    
    vfs.copy('/src', '/dest', { recursive: true })
    
    expect(vfs.exists('/dest/file1.txt')).toBe(true)
    expect(vfs.exists('/dest/subdir/file2.txt')).toBe(true)
    expect(vfs.readFile('/dest/file1.txt')).toBe('content1')
  })

  test('should support move', () => {
    vfs.writeFile('/move.txt', 'content')
    vfs.move('/move.txt', '/moved.txt')
    expect(vfs.exists('/move.txt')).toBe(false)
    expect(vfs.exists('/moved.txt')).toBe(true)
    expect(vfs.readFile('/moved.txt')).toBe('content')
  })

  test('should handle mounting', () => {
    const mountedVfs = new VirtualFileSystem('mounted-vfs')
    mountedVfs.writeFile('/mounted.txt', 'mounted content')
    
    vfs.mount('/mnt', mountedVfs)
    
    expect(vfs.exists('/mnt/mounted.txt')).toBe(true)
    expect(vfs.readFile('/mnt/mounted.txt')).toBe('mounted content')
    
    vfs.writeFile('/mnt/new.txt', 'new content')
    expect(mountedVfs.readFile('/new.txt')).toBe('new content')
  })
})
