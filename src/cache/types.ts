export type CacheNamespace =
  | 'repositoryList'
  | 'repository'
  | 'branch'
  | 'branchProtection'
  | 'collaborators'
  | 'teamPermissions'
  | 'securitySettings'
  | 'vulnerabilityAlerts'
  | 'currentUser';

export interface CacheTtlConfig {
  default?: number;
  repositoryList?: number;
  repository?: number;
  branch?: number;
  branchProtection?: number;
  collaborators?: number;
  teamPermissions?: number;
  securitySettings?: number;
  vulnerabilityAlerts?: number;
  currentUser?: number;
}

export interface CacheFeatureToggle {
  enabled: boolean;
}

export interface CacheAdaptiveConfig extends CacheFeatureToggle {
  minTTL?: number;
  maxTTL?: number;
}

export interface CachePredictiveConfig extends CacheFeatureToggle {
  threshold?: number;
}

export interface CacheCompressionConfig extends CacheFeatureToggle {
  level?: number;
}

export interface CacheConfig {
  enabled: boolean;
  storage?: 'memory';
  storagePath?: string;
  maxSize?: number;
  ttl?: CacheTtlConfig;
  adaptive?: CacheAdaptiveConfig;
  predictive?: CachePredictiveConfig;
  etag?: CacheFeatureToggle;
  compression?: CacheCompressionConfig;
}

export interface CacheKeyDescriptor {
  namespace: CacheNamespace;
  owner?: string | undefined;
  repo?: string | undefined;
  identifier?: string | undefined;
  parameters?: Record<string, unknown>;
}

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  lastAccessed: number;
  hits: number;
}

export interface CacheRecord<T> {
  descriptor: CacheKeyDescriptor;
  entry: CacheEntry<T>;
}

export interface CacheLookupOptions {
  ttl?: number;
  forceRefresh?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export interface CacheStorage {
  get(key: string): CacheRecord<unknown> | undefined;
  set(key: string, record: CacheRecord<unknown>): void;
  delete(key: string): void;
  clear(): void;
  entries(): IterableIterator<[string, CacheRecord<unknown>]>;
  size(): number;
}
