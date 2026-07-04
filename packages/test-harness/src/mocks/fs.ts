import { Volume, createFsFromVolume } from 'memfs';
import type { IFs } from 'memfs';
import path from 'path';
import {
  IVirtualFileSystem,
  VirtualFileOptions,
  VirtualFileMetadata
} from '@loopwork-ai/contracts';

export class VirtualFileSystem implements IVirtualFileSystem {
  private vol: InstanceType<typeof Volume>;
  private fs: IFs;
  private mounts: Map<string, IVirtualFileSystem | string>;

  constructor(public readonly id: string, initialContents: Record<string, string> = {}) {
    this.vol = Volume.fromJSON(initialContents);
    this.fs = createFsFromVolume(this.vol);
    this.mounts = new Map();
  }

  private normalizePath(p: string): string {
    return path.normalize(p);
  }

  private checkMount(p: string): { vfs: IVirtualFileSystem; relativePath: string } | null {
    const normalized = this.normalizePath(p);
    for (const [mountPoint, source] of this.mounts) {
      if (normalized.startsWith(mountPoint)) {
        const relativePath = normalized.slice(mountPoint.length) || '/';
        if (typeof source === 'string') {
          return null;
        }
        return { vfs: source, relativePath };
      }
    }
    return null;
  }

  readFile(path: string, options?: VirtualFileOptions): string {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.readFile(mount.relativePath, options);
    }

    try {
      const encoding = options?.encoding || 'utf8';
      return this.fs.readFileSync(path, { encoding }) as string;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      if (error.code === 'EISDIR') {
        throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
      }
      throw error;
    }
  }

  async readFileAsync(path: string, options?: VirtualFileOptions): Promise<string> {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.readFileAsync(mount.relativePath, options);
    }
    
    return new Promise((resolve, reject) => {
       const encoding = options?.encoding || 'utf8';
       this.fs.readFile(path, { encoding }, (err, data) => {
         if (err) {
            if (err.code === 'ENOENT') {
              reject(new Error(`ENOENT: no such file or directory, open '${path}'`));
            } else if (err.code === 'EISDIR') {
              reject(new Error(`EISDIR: illegal operation on a directory, read '${path}'`));
            } else {
              reject(err);
            }
         } else {
           resolve(data as string);
         }
       });
    });
  }

  writeFile(path: string, content: string, options?: VirtualFileOptions): void {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.writeFile(mount.relativePath, content, options);
    }

    if (options?.recursive) {
      const parentDir = this.normalizePath(path).split('/').slice(0, -1).join('/');
      if (parentDir && parentDir !== '.' && parentDir !== '/') {
        this.fs.mkdirSync(parentDir, { recursive: true });
      }
    }

    try {
      const writeOptions: any = {
        encoding: options?.encoding || 'utf8'
      };
      if (options?.mode !== undefined) {
        writeOptions.mode = options.mode;
      }

      this.fs.writeFileSync(path, content, writeOptions);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
         throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      throw error;
    }
  }

  async writeFileAsync(path: string, content: string, options?: VirtualFileOptions): Promise<void> {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.writeFileAsync(mount.relativePath, content, options);
    }

    if (options?.recursive) {
      const parentDir = this.normalizePath(path).split('/').slice(0, -1).join('/');
      if (parentDir && parentDir !== '.' && parentDir !== '/') {
        await new Promise<void>((resolve, reject) => {
           this.fs.mkdir(parentDir, { recursive: true }, (err) => {
             if (err) reject(err);
             else resolve();
           });
        });
      }
    }

    return new Promise((resolve, reject) => {
      const writeOptions: any = {
        encoding: options?.encoding || 'utf8'
      };
      if (options?.mode !== undefined) {
        writeOptions.mode = options.mode;
      }

      this.fs.writeFile(path, content, writeOptions, (err) => {
        if (err) {
           if (err.code === 'ENOENT') {
             reject(new Error(`ENOENT: no such file or directory, open '${path}'`));
           } else {
             reject(err);
           }
        }
        else resolve();
      });
    });
  }

  exists(path: string): boolean {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.exists(mount.relativePath);
    }
    return this.fs.existsSync(path);
  }

  delete(path: string, options?: { recursive?: boolean }): void {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.delete(mount.relativePath, options);
    }

    try {
      if (options?.recursive) {
        this.fs.rmSync(path, { recursive: true, force: true });
      } else {
        const stats = this.fs.statSync(path);
        if (stats.isDirectory()) {
          this.fs.rmdirSync(path);
        } else {
          this.fs.unlinkSync(path);
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`ENOENT: no such file or directory, '${path}'`);
      }
      if (error.code === 'ENOTEMPTY') {
        throw new Error(`ENOTEMPTY: directory not empty, '${path}'`);
      }
      throw error;
    }
  }

  async deleteAsync(path: string, options?: { recursive?: boolean }): Promise<void> {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.deleteAsync(mount.relativePath, options);
    }

    return new Promise((resolve, reject) => {
       if (options?.recursive) {
         this.fs.rm(path, { recursive: true, force: true }, (err) => {
            if (err) {
               if (err.code === 'ENOENT') reject(new Error(`ENOENT: no such file or directory, '${path}'`));
               else reject(err);
            } else resolve();
         });
       } else {
         this.fs.stat(path, (err, stats) => {
            if (err) {
               if (err.code === 'ENOENT') reject(new Error(`ENOENT: no such file or directory, '${path}'`));
               else reject(err);
               return;
            }
            if (stats && stats.isDirectory()) {
               this.fs.rmdir(path, (err) => {
                 if (err) {
                    if (err.code === 'ENOTEMPTY') reject(new Error(`ENOTEMPTY: directory not empty, '${path}'`));
                    else reject(err);
                 } else resolve();
               });
            } else {
               this.fs.unlink(path, (err) => {
                 if (err) reject(err);
                 else resolve();
               });
            }
         });
       }
    });
  }

  mkdir(path: string, options?: VirtualFileOptions): void {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.mkdir(mount.relativePath, options);
    }

    try {
      const mkdirOptions: any = { recursive: options?.recursive };
      if (options?.mode !== undefined) {
        mkdirOptions.mode = options.mode;
      }
      this.fs.mkdirSync(path, mkdirOptions);
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        throw new Error(`EEXIST: file already exists, '${path}'`);
      }
      if (error.code === 'ENOENT') {
         throw new Error(`ENOENT: no such file or directory, '${path}'`);
      }
      throw error;
    }
  }

  async mkdirAsync(path: string, options?: VirtualFileOptions): Promise<void> {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.mkdirAsync(mount.relativePath, options);
    }

    return new Promise((resolve, reject) => {
      const mkdirOptions: any = { recursive: options?.recursive };
      if (options?.mode !== undefined) {
        mkdirOptions.mode = options.mode;
      }
      this.fs.mkdir(path, mkdirOptions, (err) => {
         if (err) {
            if (err.code === 'EEXIST') {
               reject(new Error(`EEXIST: file already exists, '${path}'`));
            } else if (err.code === 'ENOENT') {
               reject(new Error(`ENOENT: no such file or directory, '${path}'`));
            } else {
               reject(err);
            }
         } else {
            resolve();
         }
      });
    });
  }

  readdir(path: string): string[] {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.readdir(mount.relativePath);
    }

    try {
      return this.fs.readdirSync(path) as string[];
    } catch (error: any) {
       if (error.code === 'ENOENT') {
          throw new Error(`ENOENT: no such file or directory, '${path}'`);
       }
       if (error.code === 'ENOTDIR') {
          throw new Error(`ENOTDIR: not a directory, '${path}'`);
       }
       throw error;
    }
  }

  async readdirAsync(path: string): Promise<string[]> {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.readdirAsync(mount.relativePath);
    }

    return new Promise((resolve, reject) => {
       this.fs.readdir(path, (err, files) => {
          if (err) {
             if (err.code === 'ENOENT') {
                reject(new Error(`ENOENT: no such file or directory, '${path}'`));
             } else if (err.code === 'ENOTDIR') {
                reject(new Error(`ENOTDIR: not a directory, '${path}'`));
             } else {
                reject(err);
             }
          } else {
             resolve(files as string[]);
          }
       });
    });
  }

  stat(path: string): VirtualFileMetadata {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.stat(mount.relativePath);
    }

    try {
      const stats = this.fs.statSync(path);
      return {
        size: Number(stats.size),
        createdAt: Number(stats.birthtimeMs),
        modifiedAt: Number(stats.mtimeMs),
        isDirectory: stats.isDirectory(),
        mode: Number(stats.mode)
      };
    } catch (error: any) {
       if (error.code === 'ENOENT') {
          throw new Error(`ENOENT: no such file or directory, '${path}'`);
       }
       throw error;
    }
  }

  async statAsync(path: string): Promise<VirtualFileMetadata> {
    const mount = this.checkMount(path);
    if (mount) {
      return mount.vfs.statAsync(mount.relativePath);
    }

    return new Promise((resolve, reject) => {
       this.fs.stat(path, (err, stats) => {
          if (err) {
             if (err.code === 'ENOENT') {
                reject(new Error(`ENOENT: no such file or directory, '${path}'`));
             } else {
                reject(err);
             }
          } else {
             resolve({
                size: Number(stats!.size),
                createdAt: Number(stats!.birthtimeMs),
                modifiedAt: Number(stats!.mtimeMs),
                isDirectory: stats!.isDirectory(),
                mode: Number(stats!.mode)
             });
          }
       });
    });
  }

  copy(src: string, dest: string, options?: { recursive?: boolean }): void {
    const srcStat = this.stat(src);
    if (srcStat.isDirectory) {
      if (!options?.recursive) {
        throw new Error(`EISDIR: illegal operation on a directory, copy '${src}'`);
      }
      this.mkdir(dest, { recursive: true });
      const entries = this.readdir(src);
      for (const entry of entries) {
        this.copy(`${src}/${entry}`, `${dest}/${entry}`, options);
      }
    } else {
      const content = this.readFile(src);
      this.writeFile(dest, content);
    }
  }

  move(src: string, dest: string): void {
     const srcMount = this.checkMount(src);
     const destMount = this.checkMount(dest);
     
     if (!srcMount && !destMount) {
        try {
           this.fs.renameSync(src, dest);
        } catch (error: any) {
           throw error;
        }
     } else {
        this.copy(src, dest, { recursive: true });
        this.delete(src, { recursive: true });
     }
  }

  resolve(p: string): string {
    return this.normalizePath(p);
  }

  reset(): void {
    this.vol.reset();
    this.mounts.clear();
  }

  getAllPaths(): string[] {
    const json = this.vol.toJSON();
    return Object.keys(json);
  }

  mount(path: string, source: IVirtualFileSystem | string): void {
    const normalized = this.normalizePath(path);
    this.mounts.set(normalized, source);
  }

  createMockProject(structure: Record<string, string>): void {
    for (const [filePath, content] of Object.entries(structure)) {
      this.writeFile(filePath, content, { recursive: true });
    }
  }
}
