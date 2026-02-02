import { PriorityQueue } from '../interfaces/index.js';

export class HeapPriorityQueue<T> implements PriorityQueue<T> {
  private items: Array<{ item: T; priority: number }> = [];

  enqueue(item: T, priority: number): void {
    this.items.push({ item, priority });
    // Stable sort to preserve FIFO for equal priorities
    this.items.sort((a, b) => b.priority - a.priority); 
  }

  dequeue(): T | null {
    const entry = this.items.shift();
    return entry ? entry.item : null;
  }

  peek(): T | null {
    return this.items[0]?.item ?? null;
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}
