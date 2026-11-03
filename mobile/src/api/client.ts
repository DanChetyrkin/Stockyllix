import { auth } from '@/config/firebase';

export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; requestKey?: string; signal?: AbortSignal } = {}): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new ApiError('AUTH_REQUIRED', 'Please sign in to continue.', 401);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json',
        ...(options.requestKey ? { 'Idempotency-Key': options.requestKey } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.error;
      throw new ApiError(detail?.code || payload?.code || 'REQUEST_FAILED', detail?.message || payload?.message || 'The server could not complete this request.', response.status, payload?.requestId || detail?.requestId);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('TIMEOUT', 'The request timed out. The server may be waking up. Retry the same request safely.', 0);
    throw new ApiError('NETWORK_ERROR', 'Unable to reach the server. Check your connection, then retry.', 0);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const messages: Record<string, string> = {
      'auth/invalid-credential': 'The email or password is incorrect.',
      'auth/email-already-in-use': 'This email already has an account. Sign in instead.',
      'auth/weak-password': 'Choose a password with at least 6 characters.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/too-many-requests': 'Too many attempts. Please wait a moment before trying again.',
      'auth/network-request-failed': 'Could not reach authentication. Check your connection.',
    };
    return messages[(error as { code?: string }).code || ''] || error.message;
  }
  return 'Something went wrong. Please try again.';
}
