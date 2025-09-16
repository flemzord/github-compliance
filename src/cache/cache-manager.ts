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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(',')}}`;
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
    if (override !== undefined) {
      return Math.max(1, override);
    }

    const ttlConfig = this.config.ttl;
    if (ttlConfig) {
      const namespaceTtl = ttlConfig[namespace as keyof CacheTtlConfig];
      if (typeof namespaceTtl === 'number' && namespaceTtl > 0) {
        return namespaceTtl;
      }
      if (typeof ttlConfig.default === 'number' && ttlConfig.default > 0) {
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

    if (this.config.storage && this.config.storage !== 'memory') {
      if (this.warnAboutStorage) {
        logger.warning(
          `Cache storage '${this.config.storage}' not yet supported, falling back to in-memory cache`
        );
      }
    }

    return new MemoryCacheStorage(this.config.maxSize);
  }
}
