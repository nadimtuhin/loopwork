import { RateLimitState, RateLimitStorage } from "../interfaces";

export class MemoryStorage implements RateLimitStorage {
  private store: Map<string, RateLimitState>;

  constructor() {
    this.store = new Map();
  }

  async getState(provider: string): Promise<RateLimitState | null> {
    return this.store.get(provider) || null;
  }

  async setState(provider: string, state: RateLimitState): Promise<void> {
    this.store.set(provider, state);
  }

  async reset(provider: string): Promise<void> {
    this.store.delete(provider);
  }
}
