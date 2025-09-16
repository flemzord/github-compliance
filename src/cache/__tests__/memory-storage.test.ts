import { MemoryCacheStorage } from '../memory-storage';
import type { CacheRecord } from '../types';

const createRecord = (
  value: unknown,
  overrides: Partial<CacheRecord<unknown>['entry']> = {},
  descriptorOverrides: Partial<CacheRecord<unknown>['descriptor']> = {}
): CacheRecord<unknown> => ({
  descriptor: {
    namespace: 'repository',
    owner: 'owner',
    repo: 'repo',
    identifier: 'details',
    ...descriptorOverrides,
  },
  entry: {
    value,
    createdAt: overrides.createdAt ?? 0,
    expiresAt: overrides.expiresAt ?? 0,
    lastAccessed: overrides.lastAccessed ?? 0,
    hits: overrides.hits ?? 0,
  },
});

describe('MemoryCacheStorage', () => {
  it('stores and retrieves cache records', () => {
    const storage = new MemoryCacheStorage();
    const record = createRecord('value');

    storage.set('key', record);

    expect(storage.get('key')).toBe(record);
    expect(storage.size()).toBe(1);
    expect([...storage.entries()]).toHaveLength(1);
  });

  it('handles circular references when calculating size', () => {
    const storage = new MemoryCacheStorage();
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const record = createRecord(circular);

    storage.set('circular', record);

    expect(storage.get('circular')).toBeDefined();
  });

  it('evicts least recently used entries when exceeding max size', () => {
    const storage = new MemoryCacheStorage(0.00025); // ~262 bytes
    const first = createRecord('first', { lastAccessed: 1 }, { identifier: 'first' });
    const second = createRecord('second', { lastAccessed: 2 }, { identifier: 'second' });

    storage.set('first', first);
    storage.set('second', second);

    expect(storage.get('first')).toBeUndefined();
    expect(storage.get('second')).toBeDefined();
  });

  it('clears all entries', () => {
    const storage = new MemoryCacheStorage();
    storage.set('key', createRecord('value'));

    storage.clear();

    expect(storage.size()).toBe(0);
    expect(storage.get('key')).toBeUndefined();
  });

  it('removes entries when they exceed cache budget individually', () => {
    const storage = new MemoryCacheStorage(0.000001); // ~1 byte, smaller than any entry
    const record = createRecord('large');

    storage.set('oversized', record);

    expect(storage.get('oversized')).toBeUndefined();
    expect(storage.size()).toBe(0);
  });
});
