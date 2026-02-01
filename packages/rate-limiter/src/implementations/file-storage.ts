import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from "fs";
import { RateLimitState, RateLimitStorage } from "../interfaces";

interface StorageContent {
  [provider: string]: RateLimitState;
}

export class FileStorage implements RateLimitStorage {
  private filePath: string;
  private lockFile: string;
  private lockTimeout: number = 2000;
  private retryDelay: number = 50;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.lockFile = `${filePath}.lock`;
  }

  async getState(provider: string): Promise<RateLimitState | null> {
    return this.withLock(() => {
      const data = this.readData();
      return data[provider] || null;
    });
  }

  async setState(provider: string, state: RateLimitState): Promise<void> {
    return this.withLock(() => {
      const data = this.readData();
      data[provider] = state;
      this.writeData(data);
    });
  }

  async reset(provider: string): Promise<void> {
    return this.withLock(() => {
      const data = this.readData();
      if (data[provider]) {
        delete data[provider];
        this.writeData(data);
      }
    });
  }

  private readData(): StorageContent {
    if (!existsSync(this.filePath)) {
      return {};
    }
    try {
      const content = readFileSync(this.filePath, "utf-8");
      if (!content.trim()) return {};
      return JSON.parse(content);
    } catch (error) {
      // In case of corruption, return empty to allow recovery
      return {};
    }
  }

  private writeData(data: StorageContent): void {
    writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  private async withLock<T>(action: () => T): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < this.lockTimeout) {
      try {
        // Exclusive create
        writeFileSync(this.lockFile, String(process.pid), { flag: "wx" });
        try {
          return action();
        } finally {
          try {
             unlinkSync(this.lockFile);
          } catch (e) {
             // Ignore unlock error
          }
        }
      } catch (e: any) {
        if (e.code === "EEXIST") {
           // Check for stale lock
           try {
             const stats = statSync(this.lockFile);
             if (Date.now() - stats.mtimeMs > this.lockTimeout) {
                try {
                   unlinkSync(this.lockFile);
                   continue;
                } catch (delErr) {
                   // Ignore
                }
             }
           } catch (statErr) {
              // Lock file might be gone
           }
           // Wait and retry
           await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        } else {
           throw e;
        }
      }
    }
    throw new Error(`Could not acquire lock on ${this.filePath}`);
  }
}
