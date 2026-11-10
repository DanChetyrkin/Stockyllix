// a missing or plain-http address is a configuration error, never a silent fallback.
export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL?.trim() || '').replace(/\/$/, '');

function validateUrl() {
  if (!apiBaseUrl)
    return 'The API URL is missing. Set EXPO_PUBLIC_API_URL to your HTTPS API address, then restart Expo or rebuild the web app.';
  try {
    const url = new URL(apiBaseUrl);
    if (url.username || url.password || url.search || url.hash)
      return 'The API URL must be a plain server address without credentials, a query or a fragment.';
    return url.protocol === 'https:' ? null : 'The API URL must use HTTPS.';
  } catch {
    return 'The API URL is invalid. Check EXPO_PUBLIC_API_URL, then restart Expo or rebuild the web app.';
  }
}

export const apiConfigurationError = validateUrl();
export const apiConfigured = apiConfigurationError === null;
