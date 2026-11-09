import { auth } from '@/config/firebase';
import { apiBaseUrl, apiConfigurationError, apiConfigured } from '@/config/api-config';
import { authErrorMessage } from '@/auth/validation';
import { ApiError, requestDeadlineMs, requestJson, type RequestOptions } from './http';
import { usesTestRealm } from './realm';

export { ApiError } from './http';

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!apiConfigured)
    throw new ApiError('CONFIGURATION_REQUIRED', apiConfigurationError || 'Configure the API before continuing.', 0);
  const user = auth?.currentUser;
  if (!user) throw new ApiError('AUTH_REQUIRED', 'Please sign in to continue.', 401);
  return requestJson<T>(
    `${apiBaseUrl}${path}`,
    () => user.getIdToken(),
    { ...options, testRealm: usesTestRealm(user.uid) },
    requestDeadlineMs(apiBaseUrl, process.env.EXPO_PUBLIC_USE_EMULATORS === 'true'),
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return (typeof code === 'string' ? authErrorMessage(code) : undefined) || error.message;
  }
  return 'Something went wrong. Please try again.';
}
