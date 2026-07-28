import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  kakaoAdditionalInfoRequestSchema,
  kakaoAuthBlockedSchema,
  kakaoAuthCallbackRedirectSchema,
  kakaoAuthContinueRequestSchema,
  kakaoDevAuthSuccessSchema,
  kakaoLogoutSuccessSchema,
  kakaoSessionActionResponseSchema,
  kakaoUnlinkSuccessSchema,
} from '../dist/index.js';

test('Kakao additional-info contract accepts the bounded dev signup exchange', () => {
  assert.deepEqual(kakaoAdditionalInfoRequestSchema.parse({
    continuationToken: '00000000-0000-4000-8000-000000000000',
    email: 'Member@example.invalid',
    displayName: '김카카오',
  }), {
    continuationToken: '00000000-0000-4000-8000-000000000000',
    email: 'member@example.invalid',
    displayName: '김카카오',
  });

  assert.equal(kakaoDevAuthSuccessSchema.safeParse({
    action: 'signup',
    member: { memberId: 'dev-member-777', kakaoUserId: '777', email: 'member@example.invalid', displayName: '김카카오', status: 'active' },
    session: { kind: 'dev-session', accessToken: '00000000-0000-4000-8000-000000000000', memberId: 'dev-member-777' },
  }).success, true);
});

test('Kakao callback continuation contracts bound success to a one-time outcome id', () => {
  const outcomeId = '00000000-0000-4000-8000-000000000000';
  assert.deepEqual(kakaoAuthCallbackRedirectSchema.parse({ action: 'auth_complete', outcomeId }), { action: 'auth_complete', outcomeId });
  assert.deepEqual(kakaoAuthContinueRequestSchema.parse({ outcomeId }), { outcomeId });
  assert.equal(kakaoAuthCallbackRedirectSchema.safeParse({ action: 'login', accessToken: 'forbidden' }).success, false);
  assert.equal(kakaoAuthBlockedSchema.safeParse({ action: 'blocked', reason: 'AUTH_OUTCOME_NOT_PENDING', message: 'expired' }).success, true);
});

test('Kakao additional-info contract rejects missing or malformed required identity fields', () => {
  assert.equal(kakaoAdditionalInfoRequestSchema.safeParse({ continuationToken: '', email: 'not-an-email', displayName: '' }).success, false);
});

test('Kakao logout and unlink share the bounded session-action response contract', () => {
  assert.deepEqual(kakaoLogoutSuccessSchema.parse({ action: 'logout' }), { action: 'logout' });
  assert.deepEqual(kakaoUnlinkSuccessSchema.parse({ action: 'unlink' }), { action: 'unlink' });
  assert.equal(kakaoSessionActionResponseSchema.safeParse({ action: 'blocked', reason: 'KAKAO_PROVIDER_UNAVAILABLE' }).success, true);
  assert.equal(kakaoSessionActionResponseSchema.safeParse({
    action: 'blocked',
    reason: 'KAKAO_PROVIDER_UNAVAILABLE',
    accessToken: 'forbidden',
  }).success, false);
  assert.equal(kakaoSessionActionResponseSchema.safeParse({ action: 'logout', accessToken: 'forbidden' }).success, false);
});
