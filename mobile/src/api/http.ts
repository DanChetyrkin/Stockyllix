export class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;

  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export interface RequestOptions { method?: string; body?: unknown; requestKey?: string; signal?: AbortSignal; testRealm?: boolean }

export function requestDeadlineMs(baseUrl: string, useEmulators: boolean): number {
  if (!useEmulators) return 75_000;
  try {
    const host = new URL(baseUrl).hostname;
    const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)
      || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
    return local ? 15_000 : 75_000;
  } catch { return 75_000; }
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => { const error = new Error('Request cancelled.'); error.name = 'AbortError'; reject(error); };
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
    if (signal.aborted) aborted();
    else signal.addEventListener('abort', aborted, { once: true });
  });
}

export async function requestJson<T>(url: string, token: () => Promise<string>, options: RequestOptions = {}, timeoutMs = 75_000): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  let authenticating = true;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    if (controller.signal.aborted) throw new Error('Request cancelled.');
    // token refresh is also bounded, even before fetch has started.
    const idToken = await abortable(token(), controller.signal);
    authenticating = false;
    const response = await abortable(fetch(url, {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json', ...(options.requestKey ? { 'Idempotency-Key': options.requestKey } : {}), ...(options.testRealm ? { 'X-Stockyllix-Test': 'true' } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: controller.signal,
    }), controller.signal);
    const payload = await abortable(response.json().catch(() => null), controller.signal);
    if (!response.ok) {
      const detail = payload?.error;
      throw new ApiError(detail?.code || payload?.code || 'REQUEST_FAILED', detail?.message || payload?.message || 'The API server could not complete this request.', response.status, payload?.requestId || detail?.requestId);
    }
    if (payload === null && response.status !== 204) throw new ApiError('INVALID_RESPONSE', 'The API server returned an unreadable response. Please retry.', 502);
    return payload as T;
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    if (controller.signal.aborted) throw new ApiError(timedOut ? 'TIMEOUT' : 'CANCELLED', timedOut ? 'The API server did not respond in time. It may be waking up or unavailable. Retry the same request safely.' : 'The request was cancelled.', 0);
    if (authenticating) throw new ApiError('AUTH_SESSION_ERROR', 'Your sign-in session could not be refreshed. Retry, or sign in again.', 401);
    throw new ApiError('NETWORK_ERROR', 'The app could not reach the API server. It may be stopped, waking up, or unavailable. Please retry.', 0);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
