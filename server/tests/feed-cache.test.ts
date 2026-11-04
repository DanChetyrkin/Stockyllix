import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import { DurableFeedCache, FeedProviderError } from '../src/feeds/cache.js';

const start = Date.parse('2026-11-04T12:00:00Z');
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

describe('durable shared feed cache', () => {
  it('coalesces concurrent readers and serves warm readers without database reads', async () => {
    const store = new MemoryStore();
    const load = vi.fn(async () => ({ price: '100' }));
    const cache = new DurableFeedCache({ store, key: 'feeds/test', load, now: () => new Date(start) });
    const results = await Promise.all(Array.from({ length: 200 }, () => cache.get()));
    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every(result => result.value?.price === '100' && !result.stale)).toBe(true);
    const reads = store.operations.reads;
    await Promise.all(Array.from({ length: 200 }, () => cache.get()));
    expect(store.operations.reads).toBe(reads);
  });

  it('restores the shared result after a process restart without another provider fetch', async () => {
    const store = new MemoryStore();
    const load = vi.fn(async () => 'last-good');
    const options = { store, key: 'feeds/test', load, now: () => new Date(start) };
    const first = await new DurableFeedCache(options).get();
    const restored = await new DurableFeedCache(options).get();
    expect(restored).toEqual(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps the original data timestamp on failure and persists retry backoff', async () => {
    let at = start;
    const store = new MemoryStore();
    const load = vi.fn(async () => 'last-good');
    const options = { store, key: 'feeds/test', load, now: () => new Date(at), ttlMs: 1_000 };
    const first = await new DurableFeedCache(options).get();
    at += 1_001;
    load.mockRejectedValue(new FeedProviderError('PROVIDER_RATE_LIMIT', 900_000));
    const failed = await new DurableFeedCache(options).get();
    expect(failed).toMatchObject({ value: 'last-good', fetchedAt: first.fetchedAt, stale: true, failureCode: 'PROVIDER_RATE_LIMIT' });
    expect(Date.parse(failed.nextRefreshAt)).toBe(at + 900_000);
    at += 60_000;
    expect(await new DurableFeedCache(options).get()).toMatchObject({ value: 'last-good', stale: true });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('prevents two processes from refreshing the same feed concurrently', async () => {
    let finish!: (value: string) => void;
    const store = new MemoryStore();
    const firstLoad = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const secondLoad = vi.fn(async () => 'second');
    const first = new DurableFeedCache({ store, key: 'feeds/test', load: firstLoad, now: () => new Date(start) }).get();
    await tick();
    const second = await new DurableFeedCache({ store, key: 'feeds/test', load: secondLoad, now: () => new Date(start) }).get();
    expect(second).toMatchObject({ value: null, refreshing: true });
    expect(secondLoad).not.toHaveBeenCalled();
    finish('first');
    expect((await first).value).toBe('first');
  });

  it('fences an expired worker after another process completes a newer refresh', async () => {
    let at = start;
    let finish!: (value: string) => void;
    const store = new MemoryStore();
    const first = new DurableFeedCache({ store, key: 'feeds/test', now: () => new Date(at),
      load: () => new Promise<string>(resolve => { finish = resolve; }) }).get();
    await tick();
    at += 46_000;
    const second = await new DurableFeedCache({ store, key: 'feeds/test', now: () => new Date(at), load: async () => 'newer' }).get();
    finish('late-old-result');
    expect((await first).value).toBe('newer');
    expect(second.value).toBe('newer');
    expect(await store.get('feeds/test')).toMatchObject({ value: 'newer', version: 2 });
  });

  it('bounds an unresponsive provider and never exposes raw exception text', async () => {
    const store = new MemoryStore();
    const timeout = await new DurableFeedCache({ store, key: 'feeds/timeout', timeoutMs: 5, leaseMs: 100,
      load: async () => new Promise<never>(() => undefined) }).get();
    expect(timeout).toMatchObject({ value: null, stale: true, failureCode: 'PROVIDER_TIMEOUT', refreshing: false });
    const failure = await new DurableFeedCache({ store, key: 'feeds/error', load: async () => { throw new Error('secret-token-do-not-show'); } }).get();
    expect(failure.failureCode).toBe('PROVIDER_UNAVAILABLE');
    expect(JSON.stringify(failure)).not.toContain('secret-token');
  });
});
