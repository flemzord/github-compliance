import * as logging from '../../logging';
import { CacheManager } from '../cache-manager';
import type { CacheConfig, CacheKeyDescriptor } from '../types';

describe('CacheManager', () => {
  const descriptor: CacheKeyDescriptor = {
    namespace: 'repository',
    owner: 'owner',
    repo: 'repo',
    identifier: 'details',
  };

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should return cached value when within TTL', async () => {
    const manager = new CacheManager(
      { enabled: true, ttl: { repository: 60 } },
      { loggerWarnings: false }
    );
    const loader = jest.fn().mockResolvedValue('value');

    const first = await manager.getOrLoad(descriptor, loader);
    const second = await manager.getOrLoad(descriptor, loader);

    expect(first).toBe('value');
    expect(second).toBe('value');
    expect(loader).toHaveBeenCalledTimes(1);

    const stats = manager.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(1);
  });

  it('should refresh value after TTL expires', async () => {
    const manager = new CacheManager(
      { enabled: true, ttl: { repository: 1 } },
      { loggerWarnings: false }
    );
    const loader = jest.fn().mockResolvedValueOnce('value-1').mockResolvedValueOnce('value-2');

    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    const first = await manager.getOrLoad(descriptor, loader);
    expect(first).toBe('value-1');

    now = 2_000; // Advance past TTL (1 second)
    const second = await manager.getOrLoad(descriptor, loader);
    expect(second).toBe('value-2');

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should respect default TTL when namespace specific TTL missing', async () => {
    const manager = new CacheManager(
      { enabled: true, ttl: { default: 1 } },
      { loggerWarnings: false }
    );
    const loader = jest.fn().mockResolvedValueOnce('value-1').mockResolvedValueOnce('value-2');

    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    const first = await manager.getOrLoad(descriptor, loader);
    expect(first).toBe('value-1');

    now = 2_000; // TTL of 1 second via default should expire cache
    const second = await manager.getOrLoad(descriptor, loader);
    expect(second).toBe('value-2');

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should invalidate namespace entries', async () => {
    const manager = new CacheManager({ enabled: true }, { loggerWarnings: false });
    const loader = jest.fn().mockResolvedValueOnce('value-1').mockResolvedValueOnce('value-2');

    await manager.getOrLoad(descriptor, loader);
    manager.invalidateNamespace('repository', 'owner', 'repo');
    const refreshed = await manager.getOrLoad(descriptor, loader);

    expect(refreshed).toBe('value-2');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should not invalidate entries when namespace filters do not match', async () => {
    const manager = new CacheManager({ enabled: true }, { loggerWarnings: false });
    const loader = jest.fn().mockResolvedValue('value');

    await manager.getOrLoad(descriptor, loader);
    manager.invalidateNamespace('repository', 'another-owner');

    await manager.getOrLoad(descriptor, loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('should bypass caching when disabled', async () => {
    const manager = new CacheManager({ enabled: false });
    const loader = jest.fn().mockResolvedValue('value');

    await manager.getOrLoad(descriptor, loader);
    await manager.getOrLoad(descriptor, loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('falls back to memory storage when unsupported storage is configured', async () => {
    const config = {
      enabled: true,
      storage: 'redis',
      ttl: { repository: 60 },
    } as unknown as CacheConfig;

    const manager = new CacheManager(config, { loggerWarnings: false });
    const loader = jest.fn().mockResolvedValueOnce('value-1').mockResolvedValueOnce('value-2');

    const first = await manager.getOrLoad(descriptor, loader);
    const second = await manager.getOrLoad(descriptor, loader);

    expect(first).toBe('value-1');
    expect(second).toBe('value-1');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('should warn when unsupported storage backend is configured', () => {
    const warnSpy = jest.spyOn(logging, 'warning').mockImplementation(() => undefined);

    const config = {
      enabled: true,
      storage: 'filesystem',
    } as unknown as CacheConfig;

    const manager = new CacheManager(config);

    expect(manager.enabled).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      "Cache storage 'filesystem' not yet supported, falling back to in-memory cache"
    );
  });

  it('should treat descriptor parameters consistently regardless of order', async () => {
    const manager = new CacheManager({ enabled: true }, { loggerWarnings: false });
    const loader = jest.fn().mockResolvedValue('value');

    await manager.getOrLoad(
      {
        namespace: 'repository',
        owner: 'OWNER',
        repo: 'REPO',
        identifier: 'details',
        parameters: {
          b: 1,
          a: [2, { z: 3 }],
          map: new Map([
            ['z', 3],
            ['a', 1],
          ]),
          set: new Set([3, 1, 2]),
          created: new Date('2024-01-01T00:00:00Z'),
        },
      },
      loader
    );

    await manager.getOrLoad(
      {
        namespace: 'repository',
        owner: 'owner',
        repo: 'repo',
        identifier: 'details',
        parameters: {
          a: [2, { z: 3 }],
          b: 1,
          map: new Map([
            ['a', 1],
            ['z', 3],
          ]),
          set: new Set([1, 2, 3]),
          created: new Date('2024-01-01T00:00:00Z'),
        },
      },
      loader
    );

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('should force refresh when requested', async () => {
    const manager = new CacheManager({ enabled: true }, { loggerWarnings: false });
    const loader = jest.fn().mockResolvedValueOnce('value-1').mockResolvedValueOnce('value-2');

    await manager.getOrLoad(descriptor, loader);
    const refreshed = await manager.getOrLoad(descriptor, loader, { forceRefresh: true });

    expect(refreshed).toBe('value-2');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should ignore invalid TTL overrides', async () => {
    const manager = new CacheManager(
      { enabled: true, ttl: { default: 1 } },
      { loggerWarnings: false }
    );
    const loader = jest.fn().mockResolvedValueOnce('value-1').mockResolvedValueOnce('value-2');

    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    await manager.getOrLoad(descriptor, loader, { ttl: Number.POSITIVE_INFINITY });

    now = 2_000; // default TTL of 1 second should cause refresh when override is invalid
    const refreshed = await manager.getOrLoad(descriptor, loader);

    expect(refreshed).toBe('value-2');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
