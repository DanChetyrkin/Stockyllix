import type { DocumentStore } from '../data/store.js';

export class FeedProviderError extends Error {
  constructor(readonly code: string, readonly retryAfterMs?: number) {
    super(code);
    this.name = 'FeedProviderError';
  }
}

interface CacheRecord<T> {
  value: T | null;
  fetchedAt: string | null;
  version: number;
  leaseUntil: number;
  nextAttemptAt: number;
  failureCode: string | null;
}

export interface FeedCacheResult<T> {
  value: T | null;
  fetchedAt: string | null;
  stale: boolean;
  refreshing: boolean;
  nextRefreshAt: string;
  failureCode: string | null;
}

interface CacheOptions<T> {
  store: DocumentStore;
  key: string;
  load: (previous: T | null, signal: AbortSignal) => Promise<T>;
  now?: () => Date;
  ttlMs?: number;
  failureBackoffMs?: number;
  timeoutMs?: number;
  leaseMs?: number;
  l1Ms?: number;
  nextRefreshDelayMs?: (value: T) => number;
}

// provider work is bounded by the request; the database keeps the last good result.
export class DurableFeedCache<T> {
  private memory: CacheRecord<T> | undefined;
  private memoryUntil = 0;
  private pending: Promise<FeedCacheResult<T>> | undefined;
  private readonly now: () => Date;
  private readonly ttl: number;
  private readonly backoff: number;
  private readonly timeout: number;
  private readonly lease: number;
  private readonly l1: number;

  constructor(private readonly options: CacheOptions<T>) {
    this.now = options.now ?? (() => new Date());
    this.ttl = options.ttlMs ?? 600_000;
    this.backoff = options.failureBackoffMs ?? 60_000;
    this.timeout = options.timeoutMs ?? 30_000;
    this.lease = options.leaseMs ?? 45_000;
    this.l1 = options.l1Ms ?? 30_000;
    if (this.lease <= this.timeout || [this.ttl, this.backoff, this.timeout, this.l1].some(value => !Number.isFinite(value) || value <= 0)) {
      throw new Error('Invalid feed cache timing');
    }
  }

  get(): Promise<FeedCacheResult<T>> {
    if (this.pending) return this.pending;
    const at = this.now().getTime();
    if (this.memory && at < this.memoryUntil && at < Math.max(this.memory.nextAttemptAt, this.memory.leaseUntil)) {
      return Promise.resolve(this.result(this.memory));
    }
    this.pending = this.readOrRefresh().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private result(record: CacheRecord<T>): FeedCacheResult<T> {
    const at = this.now().getTime();
    return {
      value: record.value, fetchedAt: record.fetchedAt,
      stale: !record.fetchedAt || at - Date.parse(record.fetchedAt) >= this.ttl || record.failureCode !== null,
      refreshing: record.leaseUntil > at,
      nextRefreshAt: new Date(Math.max(record.nextAttemptAt, record.leaseUntil)).toISOString(),
      failureCode: record.failureCode,
    };
  }

  private remember(record: CacheRecord<T>) {
    this.memory = record;
    this.memoryUntil = this.now().getTime() + (record.leaseUntil > this.now().getTime() ? Math.min(this.l1, 2_000) : this.l1);
    return this.result(record);
  }

  private async readOrRefresh(): Promise<FeedCacheResult<T>> {
    const { store, key } = this.options;
    const claim = await store.transaction(async transaction => {
      const at = this.now().getTime();
      const existing = await transaction.get<CacheRecord<T>>(key) ?? {
        value: null, fetchedAt: null, version: 0, leaseUntil: 0, nextAttemptAt: 0, failureCode: null,
      };
      if (existing.nextAttemptAt > at || existing.leaseUntil > at) return { acquired: false, record: existing };
      const record = { ...existing, version: existing.version + 1, leaseUntil: at + this.lease };
      transaction.set(key, record);
      return { acquired: true, record };
    });
    if (!claim.acquired) return this.remember(claim.record);

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let value = claim.record.value;
    let error: FeedProviderError | undefined;
    try {
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new FeedProviderError('PROVIDER_TIMEOUT'));
        }, this.timeout);
      });
      value = await Promise.race([this.options.load(claim.record.value, controller.signal), deadline]);
    } catch (cause) {
      error = cause instanceof FeedProviderError ? cause : new FeedProviderError('PROVIDER_UNAVAILABLE');
    } finally { if (timer) clearTimeout(timer); }

    const completed = await store.transaction(async transaction => {
      const current = await transaction.get<CacheRecord<T>>(key);
      const at = this.now().getTime();
      // an expired or replaced worker cannot overwrite a newer refresh.
      if (!current || current.version !== claim.record.version || current.leaseUntil <= at) return current ?? claim.record;
      const delay = error
        ? Math.max(this.backoff, Math.min(error.retryAfterMs ?? 0, 86_400_000))
        : Math.max(this.ttl, Math.min(this.options.nextRefreshDelayMs?.(value as T) ?? this.ttl, 86_400_000));
      const record: CacheRecord<T> = {
        value, version: current.version, leaseUntil: 0, nextAttemptAt: at + delay,
        fetchedAt: error ? current.fetchedAt : new Date(at).toISOString(),
        failureCode: error?.code ?? null,
      };
      transaction.set(key, record);
      return record;
    });
    return this.remember(completed);
  }
}
