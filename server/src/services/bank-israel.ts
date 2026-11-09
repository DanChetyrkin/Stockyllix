import { GameError } from '../domain/errors.js';
import { fetchBoiLatest, type BoiLatestRate } from '../world/boi.js';

interface BankIsraelView extends BoiLatestRate {
  fetchedAt: string;
  stale: boolean;
  notice?: string;
}

export class BankIsraelService {
  private readonly now: () => Date;
  private readonly load: () => Promise<BoiLatestRate>;
  private readonly ttlMs: number;
  private readonly retryMs: number;
  private cached: { rate: BoiLatestRate; fetchedAt: string; expiresAt: number } | null = null;
  private pending: Promise<BankIsraelView> | null = null;
  private retryAt = 0;

  constructor(
    options: { load?: () => Promise<BoiLatestRate>; now?: () => Date; ttlMs?: number; retryMs?: number } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.load = options.load ?? (() => fetchBoiLatest({ now: this.now }));
    this.ttlMs = options.ttlMs ?? 10 * 60_000;
    this.retryMs = options.retryMs ?? 60_000;
  }

  private unavailable(): BankIsraelView {
    if (!this.cached)
      throw new GameError(
        'REFERENCE_FX_UNAVAILABLE',
        'Bank of Israel is temporarily unavailable. Please try again later.',
        503,
        true,
      );
    return {
      ...this.cached.rate,
      fetchedAt: this.cached.fetchedAt,
      stale: true,
      notice: 'Bank of Israel could not be reached. This is the last successfully fetched representative rate.',
    };
  }

  async get(): Promise<BankIsraelView> {
    const now = this.now().getTime();
    if (this.cached && now < this.cached.expiresAt)
      return { ...this.cached.rate, fetchedAt: this.cached.fetchedAt, stale: false };
    if (now < this.retryAt) return this.unavailable();
    if (this.pending) return this.pending;
    // concurrent requests share one provider call, including a sleeping server's first request.
    this.pending = this.refresh().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async refresh(): Promise<BankIsraelView> {
    try {
      const rate = await this.load();
      const fetched = this.now();
      this.cached = { rate, fetchedAt: fetched.toISOString(), expiresAt: fetched.getTime() + this.ttlMs };
      this.retryAt = 0;
      return { ...rate, fetchedAt: this.cached.fetchedAt, stale: false };
    } catch {
      this.retryAt = this.now().getTime() + this.retryMs;
      return this.unavailable();
    }
  }
}
