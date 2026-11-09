import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authErrorMessage,
  confirmationError,
  firstValidationError,
  normalizeEmail,
  registrationErrors,
  signInErrors,
} from '../src/auth/validation.ts';

test('normalizes email without changing passwords or rejecting plus addressing', () => {
  assert.equal(normalizeEmail('  Student+League@Example.COM  '), 'student+league@example.com');
  assert.equal(firstValidationError(signInErrors('Student+League@Example.COM', ' leading spaces ')), undefined);
});

test('sign-in does not apply the registration password rules', () => {
  assert.equal(firstValidationError(signInErrors('admin@example.test', 'stockyllix-local-demo')), undefined);
  assert.equal(firstValidationError(signInErrors('player@example.test', 'short')), undefined);
  assert.match(signInErrors('missing-domain', 'password').email, /valid email/);
  assert.match(signInErrors('person@example.test', '').password, /Enter your password/);
});

test('registration rejects missing names, malformed email and weak passwords', () => {
  const invalid = registrationErrors(' ', 'someone@', 'letters-only');
  assert.match(invalid.name, /2–40/);
  assert.match(invalid.email, /valid email/);
  assert.match(invalid.password, /letter and a number/);
  for (const password of ['abc123', 'abcdefgh', '12345678']) {
    assert.ok(registrationErrors('Student', 'student@example.test', password).password);
  }
  assert.ok(registrationErrors('x'.repeat(41), 'student@example.test', 'student123').name);
  assert.ok(registrationErrors('Bad\nName', 'student@example.test', 'student123').name);
  assert.equal(
    firstValidationError(registrationErrors('  Student  ', 'Student@example.test', 'student123')),
    undefined,
  );
});

test('password confirmation compares the original password exactly', () => {
  assert.match(confirmationError('student123', ''), /again/);
  assert.match(confirmationError('student123 ', 'student123'), /do not match/);
  assert.equal(confirmationError('student123', 'student123'), undefined);
});

test('incorrect password and missing account use the same sign-in message', () => {
  const generic = 'The email or password is incorrect.';
  for (const code of [
    'auth/invalid-credential',
    'auth/invalid-login-credentials',
    'auth/wrong-password',
    'auth/user-not-found',
  ]) {
    assert.equal(authErrorMessage(code), generic);
  }
  assert.match(authErrorMessage('auth/email-already-in-use'), /Sign in instead/);
  assert.match(authErrorMessage('auth/too-many-requests'), /wait/);
  assert.match(authErrorMessage('auth/network-request-failed'), /connection/);
  assert.equal(authErrorMessage('UNKNOWN_SERVER_ERROR'), undefined);
});
