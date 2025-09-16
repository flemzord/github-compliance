import type { CacheRecord, CacheStorage } from './types';

const FALLBACK_ENTRY_SIZE_BYTES = 1024;

function calculateSize(record: CacheRecord<unknown>): number {
  try {
    const size = Buffer.byteLength(JSON.stringify(record), 'utf8');
    return Number.isFinite(size) && size > 0 ? size : FALLBACK_ENTRY_SIZE_BYTES;
  } catch {
    // Fallback when value contains circular references or non-serializable data
    return FALLBACK_ENTRY_SIZE_BYTES;
  }
}

export class MemoryCacheStorage implements CacheStorage {
  private readonly store = new Map<string, CacheRecord<unknown>>();
  private readonly sizes = new Map<string, number>();
  private readonly maxBytes?: number;
  private currentBytes = 0;

  constructor(maxSizeInMegabytes?: number) {
    if (typeof maxSizeInMegabytes === 'number' && maxSizeInMegabytes > 0) {
      this.maxBytes = maxSizeInMegabytes * 1024 * 1024;
    }
  }

  get(key: string): CacheRecord<unknown> | undefined {
    return this.store.get(key);
  }

  set(key: string, record: CacheRecord<unknown>): void {
    const size = calculateSize(record);
    const existingSize = this.sizes.get(key) ?? 0;

    this.store.set(key, record);
    this.sizes.set(key, size);
    this.currentBytes = this.currentBytes - existingSize + size;

    if (this.maxBytes !== undefined && this.currentBytes > this.maxBytes) {
      this.evictUntilWithinLimit();
    }
  }

  delete(key: string): void {
    if (this.store.delete(key)) {
      const size = this.sizes.get(key) ?? 0;
      this.currentBytes -= size;
      this.sizes.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
    this.sizes.clear();
    this.currentBytes = 0;
  }

  entries(): IterableIterator<[string, CacheRecord<unknown>]> {
    return this.store.entries();
  }

  size(): number {
    return this.store.size;
  }

  private evictUntilWithinLimit(): void {
    if (this.maxBytes === undefined) {
      return;
    }

    const entries = [...this.store.entries()].sort(([, a], [, b]) => {
      return a.entry.lastAccessed - b.entry.lastAccessed;
    });

    for (const [key] of entries) {
      if (this.currentBytes <= this.maxBytes) {
        break;
      }
      this.delete(key);
    }

    // If the newest entry is larger than the cache budget, remove it to avoid stale state
    if (this.currentBytes > this.maxBytes) {
      const newestKey = entries[entries.length - 1]?.[0];
      if (newestKey) {
        this.delete(newestKey);
      }
    }
  }
}
