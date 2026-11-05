export type AuthField = 'name' | 'email' | 'password' | 'confirmation';
export type AuthFieldErrors = Partial<Record<AuthField, string>>;

export const passwordHint = 'Use at least 8 characters, including a letter and a number.';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailError(email: string): string | undefined {
  const normalized = normalizeEmail(email);
  if (!normalized) return 'Enter your email address.';
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    return 'Enter a valid email address, such as you@example.com.';
}

export function signInErrors(email: string, password: string): AuthFieldErrors {
  return { email: emailError(email), password: password ? undefined : 'Enter your password.' };
}

export function registrationErrors(name: string, email: string, password: string): AuthFieldErrors {
  const displayName = name.trim();
  let passwordError: string | undefined;
  if (password.length < 8 || !/\p{L}/u.test(password) || !/\p{N}/u.test(password)) passwordError = passwordHint;
  else if (password.length > 4096) passwordError = 'Use a password with no more than 4096 characters.';
  return {
    name:
      displayName.length < 2 || displayName.length > 40 || /[\u0000-\u001f\u007f]/.test(displayName)
        ? 'Choose a display name with 2–40 characters.'
        : undefined,
    email: emailError(email),
    password: passwordError,
  };
}

export function confirmationError(password: string, confirmation: string): string | undefined {
  if (!confirmation) return 'Enter your password again.';
  if (confirmation !== password) return 'The passwords do not match.';
}

export function firstValidationError(errors: AuthFieldErrors): string | undefined {
  return Object.values(errors).find(value => typeof value === 'string');
}

// sign-in errors do not reveal whether an email is registered.
export function authErrorMessage(code: string): string | undefined {
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-login-credentials': 'The email or password is incorrect.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/email-already-in-use': 'This email already has an account. Sign in instead.',
    'auth/weak-password':
      'The password does not meet this project’s password rules. Try a longer password with a letter and a number.',
    'auth/password-does-not-meet-requirements':
      'The password does not meet this project’s password rules. Try a longer password with a letter and a number.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/missing-password': 'Enter your password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment before trying again.',
    'auth/network-request-failed': 'Could not reach authentication. Check your connection and try again.',
    'auth/user-disabled': 'Sign-in is unavailable for this account. Contact the project administrator.',
    'auth/operation-not-allowed': 'Email and password sign-in is not enabled. Contact the project administrator.',
  };
  return (
    messages[code] || (code.startsWith('auth/') ? 'Authentication could not finish. Please try again.' : undefined)
  );
}
