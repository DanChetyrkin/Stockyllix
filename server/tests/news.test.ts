import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import { NewsService, parseAlphaNews } from '../src/feeds/news.js';
import { instruments } from '../src/world/catalog.js';

const now = () => new Date('2026-11-04T12:00:00Z');
const secret = 'private-news-key-for-tests';
const article = {
  title: '<b>Apple</b> publishes results', source: 'Example publisher',
  url: 'https://publisher.com/article', time_published: '20261104T110000',
  summary: 'Full text is not retained', banner_image: 'https://publisher.com/photo.png',
  ticker_sentiment: [{ ticker: 'AAPL' }, { ticker: 'MSFT' }, { ticker: 'AAPL' }, { ticker: 'UNKNOWN' }],
};
const response = () => new Response(JSON.stringify({ feed: [article] }));

describe('current news metadata', () => {
  it('normalizes publication time, known instruments and plain text without copying content', () => {
    const result = parseAlphaNews({ feed: [article, article] }, instruments, now());
    expect(result.timeBasis).toBe('real-world');
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]).toMatchObject({ title: 'Apple publishes results', source: 'Example publisher',
      sourceHost: 'publisher.com', publishedAt: '2026-11-04T11:00:00.000Z', relatedInstrumentIds: ['AAPL', 'MSFT'] });
    expect(JSON.stringify(result)).not.toMatch(/Full text|banner_image|sentiment/);
  });

  it('treats an empty provider feed as an empty result, not fabricated news', () => {
    expect(parseAlphaNews({ feed: [] }, instruments, now()).articles).toEqual([]);
  });

  it.each([
    { url: 'javascript:alert(1)' }, { url: 'http://publisher.com/article' },
    { url: 'https://user:password@publisher.com/article' }, { url: 'https://127.0.0.1/article' },
    { url: 'https://10.1.1.1/article' }, { url: 'https://[::1]/article' },
    { url: 'https://localhost/article' }, { url: 'https://test.internal/article' },
    { time_published: '20260230T110000' }, { time_published: '20261105T110000' },
    { title: '' }, { source: '<b></b>' },
  ])('rejects an unsafe or malformed article %j', replacement => {
    expect(() => parseAlphaNews({ feed: [{ ...article, ...replacement }] }, instruments, now())).toThrow('NEWS_INVALID_RESPONSE');
  });

  it('does not persist an article that echoes the private key', () => {
    expect(() => parseAlphaNews({ feed: [{ ...article, title: secret }] }, instruments, now(), secret)).toThrow('NEWS_INVALID_RESPONSE');
  });

  it('sorts and bounds headlines instead of exposing an unbounded provider response', () => {
    const feed = Array.from({ length: 40 }, (_, index) => ({ ...article, url: `https://publisher.com/${index}` }));
    expect(parseAlphaNews({ feed }, instruments, now()).articles).toHaveLength(24);
    expect(() => parseAlphaNews({ unexpected: true }, instruments, now())).toThrow('NEWS_INVALID_RESPONSE');
  });
});

describe('shared news refresh and provider failures', () => {
  it('shares one refresh and persisted news across users and a restarted service', async () => {
    const store = new MemoryStore();
    const fetcher = vi.fn<typeof fetch>(async () => response());
    const options = { store, apiKey: secret, instruments, now, fetcher };
    const service = new NewsService(options);
    const results = await Promise.all(Array.from({ length: 30 }, () => service.get()));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ stale: false, fetchedAt: now().toISOString(), failureCode: null });
    expect(results[0]?.value?.articles).toHaveLength(1);
    expect(JSON.stringify(results)).not.toContain(secret);
    await new NewsService(options).get();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await store.get('feedBudgets/news-alpha-vantage-2026-11-04')).toEqual({ attempts: 1 });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('function=NEWS_SENTIMENT');
  });

  it('preserves the last good feed after a failed refresh without leaking exception text', async () => {
    const store = new MemoryStore();
    let time = now();
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async () => response())
      .mockImplementationOnce(async () => { throw new Error(`request failed ${secret}`); });
    const options = { store, apiKey: secret, instruments, now: () => time, fetcher };
    const service = new NewsService(options);
    await service.get();
    time = new Date(time.getTime() + 6 * 60 * 60 * 1000 + 1);
    const failed = await new NewsService(options).get();
    expect(failed.stale).toBe(true);
    expect(failed.failureCode).toBe('NEWS_PROVIDER_UNAVAILABLE');
    expect(failed.value?.articles).toHaveLength(1);
    expect(failed.fetchedAt).toBe(now().toISOString());
    expect(JSON.stringify(failed)).not.toContain(secret);
  });

  it.each([
    [{ Information: `Premium endpoint; api key ${secret}` }, 'NEWS_PREMIUM_REQUIRED'],
    [{ Note: `Rate limit reached ${secret}` }, 'NEWS_RATE_LIMITED'],
    [{ 'Error Message': `Rejected request ${secret}` }, 'NEWS_PROVIDER_UNAVAILABLE'],
  ])('classifies HTTP 200 provider notices instead of calling them empty news', async (body, code) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body)));
    const result = await new NewsService({ store: new MemoryStore(), apiKey: secret, instruments, now, fetcher }).get();
    expect(result.failureCode).toBe(code);
    expect(result.value).toBeNull();
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('enforces a persisted daily attempt budget across instances and resets only on the next UTC day', async () => {
    const store = new MemoryStore();
    await store.transaction(async transaction => { transaction.set('feedBudgets/news-alpha-vantage-2026-11-04', { attempts: 24 }); });
    const fetcher = vi.fn<typeof fetch>(async () => response());
    const options = { store, apiKey: secret, instruments, now, fetcher };
    const first = await new NewsService(options).get();
    const second = await new NewsService(options).get();
    expect(first.failureCode).toBe('NEWS_QUOTA_EXHAUSTED');
    expect(second.failureCode).toBe('NEWS_QUOTA_EXHAUSTED');
    expect(fetcher).not.toHaveBeenCalled();
    const tomorrow = await new NewsService({ ...options, now: () => new Date('2026-11-05T12:00:00Z') }).get();
    expect(tomorrow.failureCode).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await store.get('feedBudgets/news-alpha-vantage-2026-11-05')).toEqual({ attempts: 1 });
  });

  it('reserves a failed attempt and avoids provider calls without a key', async () => {
    const store = new MemoryStore();
    const fetcher = vi.fn<typeof fetch>(async () => new Response('limited', { status: 429 }));
    const options = { store, apiKey: secret, instruments, now, fetcher };
    expect((await new NewsService(options).get()).failureCode).toBe('NEWS_RATE_LIMITED');
    expect(await store.get('feedBudgets/news-alpha-vantage-2026-11-04')).toEqual({ attempts: 1 });
    const missing = await new NewsService({ ...options, store: new MemoryStore(), apiKey: '' }).get();
    expect(missing.failureCode).toBe('NEWS_NOT_CONFIGURED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a credential rejection after the owner changes the provider key', async () => {
    const store = new MemoryStore();
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => new Response(JSON.stringify({ Information: 'Premium endpoint' })))
      .mockImplementationOnce(async () => response());
    const options = { store, apiKey: secret, instruments, now, fetcher };
    expect((await new NewsService(options).get()).failureCode).toBe('NEWS_PREMIUM_REQUIRED');
    const rotated = await new NewsService({ ...options, apiKey: 'new-private-provider-key' }).get();
    expect(rotated.failureCode).toBeNull();
    expect(rotated.value?.articles).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(rotated)).not.toMatch(/private-news-key|new-private-provider-key/);
  });
});
