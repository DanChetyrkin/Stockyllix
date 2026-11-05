const useEmulators = process.env.EXPO_PUBLIC_USE_EMULATORS === 'true';
const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

// localhost is an explicit emulator convenience, never a production fallback.
export const apiBaseUrl = (configuredUrl || (useEmulators ? 'http://localhost:3000/api' : '')).replace(/\/$/, '');

function isDevelopmentHost(host: string) {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1' ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

function validateUrl() {
  if (!apiBaseUrl)
    return 'The API URL is missing. Set EXPO_PUBLIC_API_URL to your HTTPS API address, then restart Expo or rebuild the web app.';
  try {
    const url = new URL(apiBaseUrl);
    if (url.username || url.password || url.search || url.hash)
      return 'The API URL must be a plain server address without credentials, a query or a fragment.';
    if (url.protocol === 'https:') return null;
    if (useEmulators && url.protocol === 'http:' && isDevelopmentHost(url.hostname)) return null;
    return 'The API URL must use HTTPS. HTTP is allowed only for an explicitly enabled local emulator on localhost or a private development network.';
  } catch {
    return 'The API URL is invalid. Check EXPO_PUBLIC_API_URL, then restart Expo or rebuild the web app.';
  }
}

export const apiConfigurationError = validateUrl();
export const apiConfigured = apiConfigurationError === null;
