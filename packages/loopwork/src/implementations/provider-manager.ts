export interface ProviderConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

export class ProviderManager {
  private providers: Map<string, ProviderConfig> = new Map();
  private usage: Map<string, { requests: number; tokens: number; lastReset: number }> = new Map();

  addProvider(name: string, config: ProviderConfig): void {
    if (this.providers.has(name)) {
      throw new Error(`Provider '${name}' already exists`);
    }
    this.providers.set(name, config);
    this.usage.set(name, { requests: 0, tokens: 0, lastReset: Date.now() });
  }

  getProviderConfig(name: string): ProviderConfig | undefined {
    return this.providers.get(name);
  }

  async checkLimit(name: string, tokensCost: number = 0): Promise<boolean> {
    const config = this.providers.get(name);
    if (!config) {
      throw new Error(`Provider '${name}' not found`);
    }

    let usage = this.usage.get(name);
    if (!usage) {
      usage = { requests: 0, tokens: 0, lastReset: Date.now() };
      this.usage.set(name, usage);
    }

    const now = Date.now();
    if (now - usage.lastReset >= 60000) {
      usage.requests = 0;
      usage.tokens = 0;
      usage.lastReset = now;
    }

    if (usage.requests + 1 > config.requestsPerMinute) {
      return false;
    }

    if (usage.tokens + tokensCost > config.tokensPerMinute) {
      return false;
    }

    usage.requests++;
    usage.tokens += tokensCost;
    return true;
  }
}
