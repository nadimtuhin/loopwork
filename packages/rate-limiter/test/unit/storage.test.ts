import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { existsSync, mkdirSync, rmdirSync } from "node:fs";
import { RateLimitState, RateLimitStorage } from "../../src/interfaces";
import { MemoryStorage } from "../../src/implementations/memory-storage";
import { FileStorage } from "../../src/implementations/file-storage";

const TEST_DIR = join(process.cwd(), "packages/rate-limiter/test/temp");
const TEST_FILE = join(TEST_DIR, "rate-limits.json");

describe("Rate Limit Storage", () => {
  describe("Memory Storage", () => {
    let storage: RateLimitStorage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    test("should store and retrieve rate limit state", async () => {
      const state: RateLimitState = {
        provider: "claude",
        used: 5,
        lastRequest: Date.now(),
        metadata: { tier: "free" },
      };

      await storage.setState("claude", state);
      const retrieved = await storage.getState("claude");

      expect(retrieved).toEqual(state);
    });

    test("should return null for non-existent provider", async () => {
      const retrieved = await storage.getState("non-existent");
      expect(retrieved).toBeNull();
    });

    test("should reset state for a provider", async () => {
      const state: RateLimitState = {
        provider: "claude",
        used: 5,
        lastRequest: Date.now(),
      };

      await storage.setState("claude", state);
      await storage.reset("claude");
      const retrieved = await storage.getState("claude");

      expect(retrieved).toBeNull();
    });

    test("should handle concurrent reads/writes", async () => {
        // Memory storage is synchronous in nature for Map, but let's simulate async access
        const updates = Array.from({ length: 100 }, (_, i) => ({
            provider: "concurrent-test",
            used: i,
            lastRequest: Date.now() + i
        }));

        await Promise.all(updates.map(u => storage.setState("concurrent-test", u)));
        
        // The last write should win, or at least it should be a valid state
        const retrieved = await storage.getState("concurrent-test");
        expect(retrieved).not.toBeNull();
        expect(retrieved?.provider).toBe("concurrent-test");
    });
  });

  describe("File Storage", () => {
    let storage: RateLimitStorage;

    beforeEach(async () => {
      if (!existsSync(TEST_DIR)) {
        mkdirSync(TEST_DIR, { recursive: true });
      }
      storage = new FileStorage(TEST_FILE);
      // Ensure clean slate
      try {
        await unlink(TEST_FILE);
      } catch (e) {
        // Ignore if file doesn't exist
      }
    });

    afterEach(async () => {
        try {
            if (existsSync(TEST_FILE)) {
                await unlink(TEST_FILE);
            }
            if (existsSync(TEST_DIR)) {
                rmdirSync(TEST_DIR);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    test("should persist state to file", async () => {
      const state: RateLimitState = {
        provider: "openai",
        used: 10,
        lastRequest: Date.now(),
      };

      await storage.setState("openai", state);
      
      // Create a new instance to verify persistence
      const newStorage = new FileStorage(TEST_FILE);
      const retrieved = await newStorage.getState("openai");

      expect(retrieved).toEqual(state);
    });

    test("should load state from file on init", async () => {
        const initialState = {
            "gemini": {
                provider: "gemini",
                used: 20,
                lastRequest: 1234567890
            }
        };
        await Bun.write(TEST_FILE, JSON.stringify(initialState));

        const newStorage = new FileStorage(TEST_FILE);
        const retrieved = await newStorage.getState("gemini");
        
        expect(retrieved).toEqual(initialState["gemini"]);
    });

    test("should handle missing file gracefully", async () => {
       // File doesn't exist (cleaned up in beforeEach)
       const retrieved = await storage.getState("any");
       expect(retrieved).toBeNull();
    });

    test("should handle corrupted file data", async () => {
        await Bun.write(TEST_FILE, "{ corrupted json");
        
        // It should probably recover by ignoring the file or returning null/empty
        // The implementation should catch JSON parse errors
        const retrieved = await storage.getState("any");
        expect(retrieved).toBeNull();
        
        // Should be able to write new state even if file was corrupted
        const state: RateLimitState = {
            provider: "recover",
            used: 1,
            lastRequest: Date.now()
        };
        await storage.setState("recover", state);
        const saved = await storage.getState("recover");
        expect(saved).toEqual(state);
    });

    test("should support multiple providers", async () => {
        const state1: RateLimitState = { provider: "p1", used: 1, lastRequest: 1 };
        const state2: RateLimitState = { provider: "p2", used: 2, lastRequest: 2 };

        await storage.setState("p1", state1);
        await storage.setState("p2", state2);

        const retrieved1 = await storage.getState("p1");
        const retrieved2 = await storage.getState("p2");

        expect(retrieved1).toEqual(state1);
        expect(retrieved2).toEqual(state2);
    });
  });
});
