import * as logger from '../logging';
import { MemoryCacheStorage } from './memory-storage';
import type {
  CacheConfig,
  CacheKeyDescriptor,
  CacheLookupOptions,
  CacheNamespace,
  CacheRecord,
  CacheStats,
  CacheStorage,
  CacheTtlConfig,
} from './types';

function normalizeForStableStringify(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;

  if (valueType === 'number' || valueType === 'boolean') {
    return value;
  }

  if (valueType === 'string') {
    return value;
  }

  if (valueType === 'bigint') {
    return (value as bigint).toString();
  }

  if (valueType === 'undefined') {
    return { __type: 'undefined' };
  }

  if (valueType === 'symbol') {
    return { __type: 'symbol', value: String(value) };
  }

  if (valueType === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    return { __type: 'function', value: fn.name || 'anonymous' };
  }

  if (value instanceof Date) {
    return { __type: 'Date', value: value.toISOString() };
  }

  if (value instanceof RegExp) {
    return { __type: 'RegExp', value: value.toString() };
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableStringify(item, seen));
  }

  if (value instanceof Set) {
    const normalizedItems = [...value].map((item) => normalizeForStableStringify(item, seen));
    normalizedItems.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { __type: 'Set', value: normalizedItems };
  }

  if (value instanceof Map) {
    const normalizedEntries = [...value.entries()].map(([key, val]) => [
      normalizeForStableStringify(key, seen),
      normalizeForStableStringify(val, seen),
    ]);
    normalizedEntries.sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
    return { __type: 'Map', value: normalizedEntries };
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const uint8Values = Array.from(
      new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
    );
    return { __type: view.constructor.name, value: uint8Values };
  }

  if (value instanceof ArrayBuffer) {
    return { __type: 'ArrayBuffer', value: Array.from(new Uint8Array(value)) };
  }

  if (valueType === 'object') {
    if (seen.has(value as object)) {
      return { __type: 'Circular' };
    }
    seen.add(value as object);
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const normalizedObject: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      normalizedObject[key] = normalizeForStableStringify(val, seen);
    }
    seen.delete(value as object);
    return normalizedObject;
  }

  return String(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableStringify(value, new WeakSet()));
}

function normalizeDescriptor(descriptor: CacheKeyDescriptor): CacheKeyDescriptor {
  const normalized: CacheKeyDescriptor = {
    namespace: descriptor.namespace,
    owner: descriptor.owner?.toLowerCase(),
    repo: descriptor.repo?.toLowerCase(),
    identifier: descriptor.identifier,
  };

  if (descriptor.parameters !== undefined) {
    normalized.parameters = descriptor.parameters;
  }

  return normalized;
}

function buildCacheKey(descriptor: CacheKeyDescriptor): string {
  const normalized = normalizeDescriptor(descriptor);
  const parts = [
    normalized.namespace,
    normalized.owner ?? '*',
    normalized.repo ?? '*',
    normalized.identifier ?? '*',
  ];
  const parameters = normalized.parameters ? `#${stableStringify(normalized.parameters)}` : '';
  return `${parts.join(':')}${parameters}`;
}

function isExpired(record: CacheRecord<unknown>, now: number): boolean {
  return record.entry.expiresAt <= now;
}

function isValidTtl(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export interface CacheManagerOptions {
  loggerWarnings?: boolean;
}

export class CacheManager {
  private readonly config: CacheConfig;
  private readonly storage: CacheStorage;
  private readonly stats = {
    hits: 0,
    misses: 0,
  };
  private readonly warnAboutStorage: boolean;

  constructor(config: CacheConfig, options?: CacheManagerOptions) {
    this.config = config;
    this.warnAboutStorage = options?.loggerWarnings !== false;
    this.storage = this.createStorage();
  }

  get enabled(): boolean {
    return this.config.enabled === true;
  }

  async getOrLoad<T>(
    descriptor: CacheKeyDescriptor,
    loader: () => Promise<T>,
    options?: CacheLookupOptions
  ): Promise<T> {
    if (!this.enabled) {
      return loader();
    }

    const key = buildCacheKey(descriptor);

    if (options?.forceRefresh) {
      this.storage.delete(key);
    }

    const now = Date.now();
    const existing = this.storage.get(key) as CacheRecord<T> | undefined;
    if (existing && !isExpired(existing, now)) {
      existing.entry.hits += 1;
      existing.entry.lastAccessed = now;
      this.storage.set(key, existing);
      this.stats.hits += 1;
      return existing.entry.value;
    }

    if (existing) {
      this.storage.delete(key);
    }

    this.stats.misses += 1;
    const value = await loader();
    const ttlSeconds = this.resolveTTL(descriptor.namespace, options?.ttl);
    const expiresAt = now + ttlSeconds * 1000;

    const record: CacheRecord<T> = {
      descriptor: normalizeDescriptor(descriptor),
      entry: {
        value,
        createdAt: now,
        expiresAt,
        lastAccessed: now,
        hits: 0,
      },
    };

    this.storage.set(key, record as CacheRecord<unknown>);
    return value;
  }

  invalidate(descriptor: CacheKeyDescriptor): void {
    if (!this.enabled) {
      return;
    }

    const key = buildCacheKey(descriptor);
    this.storage.delete(key);
  }

  invalidateNamespace(namespace: CacheNamespace, owner?: string, repo?: string): void {
    if (!this.enabled) {
      return;
    }

    const normalizedOwner = owner?.toLowerCase();
    const normalizedRepo = repo?.toLowerCase();

    for (const [key, record] of this.storage.entries()) {
      if (record.descriptor.namespace !== namespace) {
        continue;
      }
      if (normalizedOwner && record.descriptor.owner !== normalizedOwner) {
        continue;
      }
      if (normalizedRepo && record.descriptor.repo !== normalizedRepo) {
        continue;
      }
      this.storage.delete(key);
    }
  }

  clear(): void {
    this.storage.clear();
  }

  getStats(): CacheStats {
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.storage.size(),
    };
  }

  private resolveTTL(namespace: CacheNamespace, override?: number): number {
    if (override !== undefined && isValidTtl(override)) {
      return Math.max(1, override);
    }

    const ttlConfig = this.config.ttl;
    if (ttlConfig) {
      const namespaceTtl = ttlConfig[namespace as keyof CacheTtlConfig];
      if (isValidTtl(namespaceTtl)) {
        return namespaceTtl;
      }
      if (isValidTtl(ttlConfig.default)) {
        return ttlConfig.default;
      }
    }

    // Default fallback to 15 minutes
    return 900;
  }

  private createStorage(): CacheStorage {
    if (!this.config.enabled) {
      return new MemoryCacheStorage();
    }

    const configuredStorage = this.config.storage as string | undefined;
    if (configuredStorage && configuredStorage !== 'memory') {
      if (this.warnAboutStorage) {
        logger.warning(
          `Cache storage '${configuredStorage}' not yet supported, falling back to in-memory cache`
        );
      }
    }

    return new MemoryCacheStorage(this.config.maxSize);
  }
}
