import { SlidingWindow } from '../interfaces';

export interface SlidingWindowConfig {
  limit: number;
  windowMs: number;
}

export interface TimeSource {
  now(): number;
}

export class SlidingWindowImpl implements SlidingWindow {
  limit: number;
  windowMs: number;
  private requests: number[] = [];
  private timeSource: TimeSource;

  constructor(config: SlidingWindowConfig, timeSource: TimeSource = { now: () => Date.now() }) {
    this.limit = config.limit;
    this.windowMs = config.windowMs;
    this.timeSource = timeSource;
  }

  allow(): boolean {
    this.cleanup();
    if (this.requests.length >= this.limit) {
      return false;
    }
    this.requests.push(this.timeSource.now());
    return true;
  }

  getCount(): number {
    this.cleanup();
    return this.requests.length;
  }

  private cleanup(): void {
    const now = this.timeSource.now();
    const cutoff = now - this.windowMs;
    this.requests = this.requests.filter(timestamp => timestamp > cutoff);
  }
}
