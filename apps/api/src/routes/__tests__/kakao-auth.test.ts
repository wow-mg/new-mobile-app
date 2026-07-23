import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client.js', () => ({
  db: { execute: vi.fn() },
}));

const persistedMembers = new Map<string, { memberId: string; kakaoUserId: string; email?: string; phone?: string; displayName: string; status: 'active' | 'withdrawn' }>();
vi.mock('../../services/kakao-identity.service.js', () => ({
  findOrCreateKakaoMember: vi.fn(async (profile: { kakaoUserId: string; email?: string; phone?: string; displayName: string }) => {
    const email = profile.email?.trim().toLowerCase();
    const phoneDigits = profile.phone?.replace(/\D/g, '');
    const phone = phoneDigits?.startsWith('82') ? `0${phoneDigits.slice(2)}` : phoneDigits;
    const existing = persistedMembers.get(profile.kakaoUserId);
    if (existing) return existing.status === 'withdrawn'
      ? { action: 'blocked', reason: 'WITHDRAWN_MEMBER', message: '탈퇴 처리된 계정은 재가입 정책 확인 후 이용할 수 있습니다.' }
      : { action: 'login', member: existing };
    if (!email) return { action: 'additional_info_required' };
    for (const member of persistedMembers.values()) {
      if (email && member.email === email) return { action: 'blocked', reason: 'DUPLICATE_EMAIL', message: '이미 가입된 이메일입니다.' };
      if (phone && member.phone === phone) return { action: 'blocked', reason: 'DUPLICATE_PHONE', message: '이미 가입된 연락처입니다.' };
    }
    const member = { memberId: `dev-member-${profile.kakaoUserId}`, ...profile, email, phone, status: 'active' as const };
    persistedMembers.set(profile.kakaoUserId, member);
    return { action: 'signup', member };
  }),
  markKakaoMemberWithdrawn: vi.fn(async (kakaoUserId: string) => {
    const member = persistedMembers.get(kakaoUserId);
    if (member) persistedMembers.set(kakaoUserId, { ...member, status: 'withdrawn' });
  }),
}));

const originalEnv = { ...process.env };

async function loadApp() {
  vi.resetModules();
  const route = await import('../kakao-auth.js');
  route.__kakaoAuthDevTestState.reset();
  const { app } = await import('../../app.js');
  return { app, kakaoDevTestState: route.__kakaoAuthDevTestState };
}

function mockKakaoFetch(profile: { id?: string | number; email?: string; phone?: string; nickname?: string }, tokenStatus = 200) {
  const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const href = String(url);
    if (href === 'https://kauth.kakao.com/oauth/token') {
      return new Response(JSON.stringify(tokenStatus === 200 ? { access_token: 'mock-access-token' } : { error: 'invalid_grant' }), {
        status: tokenStatus,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href === 'https://kapi.kakao.com/v2/user/me') {
      return new Response(
        JSON.stringify({
          id: profile.id,
          kakao_account: {
            email: profile.email,
            phone_number: profile.phone,
            profile: { nickname: profile.nickname },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Kakao OAuth dev initiation route', () => {
  beforeEach(() => {
    persistedMembers.clear();
    vi.unstubAllGlobals();
    process.env.DATABASE_URL = 'postgres://user:pass@example.invalid:5432/db';
    process.env.API_BEARER_TOKEN = 'test';
    delete process.env.SERVICE_REST_API_KEY;
    delete process.env.KAKAO_CLIENT_SECRET;
    delete process.env.PUBLIC_AUTH_BASE_URL;
    delete process.env.EXPO_PUBLIC_APP_SCHEME;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(process.env)) {
      if (originalEnv[key] === undefined) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('does not expose Kakao authorization without the server-side REST key', async () => {
    const { app } = await loadApp();
    const res = await app.request('/auth/kakao');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'KAKAO_REST_API_KEY_NOT_CONFIGURED' });
  });

  it('redirects to Kakao authorize from the unauthenticated server route when configured', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.PUBLIC_AUTH_BASE_URL = 'https://api.example.invalid';

    const { app } = await loadApp();
    const res = await app.request('/auth/kakao', { redirect: 'manual' });
    const location = res.headers.get('location') ?? '';

    expect(res.status).toBe(302);
    expect(location).toContain('https://kauth.kakao.com/oauth/authorize');
    expect(location).toContain('client_id=placeholder-rest-key');
    expect(location).toContain('redirect_uri=https%3A%2F%2Fapi.example.invalid%2Fauth%2Fkakao%2Fcallback');
    expect(location).toContain('response_type=code');
  });

  it('returns a failure-case-specific message when the callback has no code', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';

    const { app } = await loadApp();
    const res = await app.request('/auth/kakao/callback');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'KAKAO_AUTH_CODE_MISSING', message: '카카오 인증 코드가 없습니다.' });
  });

  it('exchanges a callback code and auto-signs up a new dev member with a dev session', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.PUBLIC_AUTH_BASE_URL = 'https://api.example.invalid';
    const fetchMock = mockKakaoFetch({ id: 12345, email: 'member@example.invalid', phone: '+82 10-0000-0000', nickname: '피클러' });

    const { app } = await loadApp();
    const res = await app.request('/auth/kakao/callback?code=mock-code');
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      action: 'signup',
      member: { memberId: 'dev-member-12345', kakaoUserId: '12345', email: 'member@example.invalid', displayName: '피클러', status: 'active' },
      session: { kind: 'dev-session', accessToken: 'dev-session:dev-member-12345', memberId: 'dev-member-12345' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('omits client_secret from the Kakao token exchange when the optional server secret is unset', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.PUBLIC_AUTH_BASE_URL = 'https://api.example.invalid';
    const fetchMock = mockKakaoFetch({ id: 'without-secret', email: 'without-secret@example.invalid' });

    const { app } = await loadApp();
    const res = await app.request('/auth/kakao/callback?code=mock-code');

    expect(res.status).toBe(201);
    const tokenRequest = fetchMock.mock.calls.find(([url]) => String(url) === 'https://kauth.kakao.com/oauth/token');
    expect(tokenRequest).toBeDefined();
    const tokenForm = new URLSearchParams(String(tokenRequest?.[1]?.body));
    expect(tokenForm.get('client_id')).toBe('placeholder-rest-key');
    expect(tokenForm.get('code')).toBe('mock-code');
    expect(tokenForm.has('client_secret')).toBe(false);
  });

  it('includes client_secret in the Kakao token exchange only when configured', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.KAKAO_CLIENT_SECRET = 'test-client-secret-fixture';
    process.env.PUBLIC_AUTH_BASE_URL = 'https://api.example.invalid';
    const fetchMock = mockKakaoFetch({ id: 'with-secret', email: 'with-secret@example.invalid' });

    const { app } = await loadApp();
    const res = await app.request('/auth/kakao/callback?code=mock-code');

    expect(res.status).toBe(201);
    const tokenRequest = fetchMock.mock.calls.find(([url]) => String(url) === 'https://kauth.kakao.com/oauth/token');
    expect(tokenRequest).toBeDefined();
    const tokenForm = new URLSearchParams(String(tokenRequest?.[1]?.body));
    expect(tokenForm.get('client_id')).toBe('placeholder-rest-key');
    expect(tokenForm.get('code')).toBe('mock-code');
    expect(tokenForm.get('client_secret')).toBe('test-client-secret-fixture');
  });

  it('logs in an existing dev member on a repeated Kakao callback', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    mockKakaoFetch({ id: 'existing-1', email: 'existing@example.invalid', nickname: '기존회원' });

    const { app } = await loadApp();
    const signup = await app.request('/auth/kakao/callback?code=first-code');
    const login = await app.request('/auth/kakao/callback?code=second-code');
    const body = await login.json();

    expect(signup.status).toBe(201);
    expect(login.status).toBe(200);
    expect(body).toMatchObject({ action: 'login', member: { kakaoUserId: 'existing-1', email: 'existing@example.invalid' } });
  });

  it('logs in from durable identity state after the route module is reloaded', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    mockKakaoFetch({ id: 'restart-1', email: 'restart@example.invalid', nickname: '재시작회원' });
    const first = await loadApp();
    expect((await first.app.request('/auth/kakao/callback?code=first-code')).status).toBe(201);

    mockKakaoFetch({ id: 'restart-1', email: 'restart@example.invalid', nickname: '재시작회원' });
    const restarted = await loadApp();
    const login = await restarted.app.request('/auth/kakao/callback?code=second-code');

    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ action: 'login', member: { kakaoUserId: 'restart-1' } });
  });

  it('routes email-missing Kakao accounts to additional info instead of creating a member', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    mockKakaoFetch({ id: 777, nickname: '이메일없음' });

    const { app } = await loadApp();
    const res = await app.request('/auth/kakao/callback?code=mock-code');

    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ action: 'additional_info_required', reason: 'EMAIL_MISSING', kakaoUserId: '777', continuationToken: expect.any(String), next: '/auth/additional-info' });
  });

  it('completes an email-missing Kakao dev signup and logs in on the next callback', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    mockKakaoFetch({ id: 777, nickname: '이메일없음' });

    const { app } = await loadApp();
    const callback = await app.request('/auth/kakao/callback?code=mock-code');
    const callbackBody = await callback.json() as { continuationToken: string };
    const completion = await app.request('/auth/kakao/additional-info', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ continuationToken: callbackBody.continuationToken, email: 'member@example.invalid', displayName: '김카카오', phone: '010-1234-5678' }),
    });
    const login = await app.request('/auth/kakao/callback?code=next-code');

    expect(callback.status).toBe(202);
    expect(completion.status).toBe(201);
    expect(await completion.json()).toMatchObject({
      action: 'signup',
      member: { kakaoUserId: '777', email: 'member@example.invalid', displayName: '김카카오' },
      session: { kind: 'dev-session', memberId: 'dev-member-777' },
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ action: 'login', member: { kakaoUserId: '777' } });
  });

  it('rejects additional info without a valid pending continuation', async () => {
    const { app } = await loadApp();
    const res = await app.request('/auth/kakao/additional-info', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ continuationToken: '00000000-0000-4000-8000-000000000000', email: 'member@example.invalid', displayName: '김카카오' }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ action: 'blocked', reason: 'ADDITIONAL_INFO_NOT_PENDING', message: '추가 정보 입력 요청이 만료되었거나 유효하지 않습니다.' });
  });

  it('rejects reused and expired additional-info continuations', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    mockKakaoFetch({ id: 'expiring-id', nickname: '이메일없음' });
    const { app, kakaoDevTestState } = await loadApp();
    const callback = await app.request('/auth/kakao/callback?code=mock-code');
    const { continuationToken } = await callback.json() as { continuationToken: string };
    const input = { continuationToken, email: 'member@example.invalid', displayName: '김카카오' };

    kakaoDevTestState.expireAdditionalInfo(continuationToken);
    const expired = await app.request('/auth/kakao/additional-info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    expect(expired.status).toBe(409);

    const freshCallback = await app.request('/auth/kakao/callback?code=next-code');
    const fresh = await freshCallback.json() as { continuationToken: string };
    const freshInput = { ...input, continuationToken: fresh.continuationToken };
    const completed = await app.request('/auth/kakao/additional-info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(freshInput) });
    const reused = await app.request('/auth/kakao/additional-info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(freshInput) });
    expect(completed.status).toBe(201);
    expect(reused.status).toBe(409);
  });

  it('returns the email-missing callback to the state-bound mobile deep link', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.EXPO_PUBLIC_APP_SCHEME = 'happickle';
    mockKakaoFetch({ id: 'mobile-id', nickname: '모바일' });
    const { app } = await loadApp();
    const start = await app.request('/auth/kakao?returnTo=happickle%3A%2F%2F%2F', { redirect: 'manual' });
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
    const callback = await app.request(`/auth/kakao/callback?code=mock-code&state=${encodeURIComponent(state ?? '')}`, { redirect: 'manual' });
    const redirect = new URL(callback.headers.get('location') ?? '');

    expect(callback.status).toBe(302);
    expect(redirect.protocol).toBe('happickle:');
    expect(redirect.searchParams.get('action')).toBe('additional_info_required');
    expect(redirect.searchParams.get('continuationToken')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('redirects state-bound signup and login through one-time outcomes while direct callbacks stay JSON', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.EXPO_PUBLIC_APP_SCHEME = 'happickle';
    mockKakaoFetch({ id: 'success-mobile', email: 'mobile@example.invalid', nickname: '모바일' });
    const { app } = await loadApp();

    const start = await app.request('/auth/kakao?returnTo=happickle%3A%2F%2F%2F', { redirect: 'manual' });
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
    const callback = await app.request(`/auth/kakao/callback?code=first&state=${encodeURIComponent(state ?? '')}`, { redirect: 'manual' });
    const redirect = new URL(callback.headers.get('location') ?? '');
    expect(callback.status).toBe(302);
    expect(redirect.searchParams.get('action')).toBe('auth_complete');
    expect(redirect.searchParams.get('outcomeId')).toMatch(/^[0-9a-f-]{36}$/);
    expect(redirect.toString()).not.toMatch(/accessToken|dev-session|memberId|mobile%40/);

    const outcomeId = redirect.searchParams.get('outcomeId');
    const continued = await app.request('/auth/kakao/continue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcomeId }) });
    expect(continued.status).toBe(201);
    expect(await continued.json()).toMatchObject({ action: 'signup', member: { kakaoUserId: 'success-mobile' } });
    const reused = await app.request('/auth/kakao/continue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcomeId }) });
    expect(reused.status).toBe(409);

    mockKakaoFetch({ id: 'success-mobile', email: 'mobile@example.invalid', nickname: '모바일' });
    const direct = await app.request('/auth/kakao/callback?code=direct');
    expect(direct.status).toBe(200);
    expect(await direct.json()).toMatchObject({ action: 'login', member: { kakaoUserId: 'success-mobile' } });
  });

  it('allows the deployed dev web app return URL so Kakao callbacks do not stop on raw JSON', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.EXPO_PUBLIC_APP_SCHEME = 'happickle';
    mockKakaoFetch({ id: 'dev-web-mobile', email: 'web@example.invalid', nickname: '웹모바일' });
    const { app } = await loadApp();

    const returnTo = 'https://picklehub-mobile-dev-production.up.railway.app/';
    const start = await app.request(`/auth/kakao?returnTo=${encodeURIComponent(returnTo)}`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
    const callback = await app.request(`/auth/kakao/callback?code=dev-web&state=${encodeURIComponent(state ?? '')}`, { redirect: 'manual' });
    const redirect = new URL(callback.headers.get('location') ?? '');

    expect(state).toMatch(/^[0-9a-f-]{36}$/);
    expect(callback.status).toBe(302);
    expect(redirect.origin).toBe('https://picklehub-mobile-dev-production.up.railway.app');
    expect(redirect.searchParams.get('action')).toBe('auth_complete');
    expect(redirect.searchParams.get('outcomeId')).toMatch(/^[0-9a-f-]{36}$/);
    expect(redirect.toString()).not.toMatch(/accessToken|dev-session|memberId|web%40/);
  });

  it('does not redirect a callback to a non-allowlisted custom scheme', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.EXPO_PUBLIC_APP_SCHEME = 'happickle';
    mockKakaoFetch({ id: 'mobile-id', nickname: '모바일' });
    const { app } = await loadApp();
    const start = await app.request('/auth/kakao?returnTo=attacker-app%3A%2F%2F%2F', { redirect: 'manual' });
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
    expect(state).toBeNull();
  });

  it('returns state-bound persistence failures to the app as a blocked redirect', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.EXPO_PUBLIC_APP_SCHEME = 'happickle';
    mockKakaoFetch({ id: 'db-failure', email: 'failure@example.invalid' });
    const { app } = await loadApp();
    const identityService = await import('../../services/kakao-identity.service.js');
    vi.mocked(identityService.findOrCreateKakaoMember).mockRejectedValueOnce(new Error('test persistence failure'));
    const start = await app.request('/auth/kakao?returnTo=happickle%3A%2F%2F%2F', { redirect: 'manual' });
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
    const callback = await app.request(`/auth/kakao/callback?code=mock-code&state=${encodeURIComponent(state ?? '')}`, { redirect: 'manual' });
    const redirect = new URL(callback.headers.get('location') ?? '');

    expect(callback.status).toBe(302);
    expect(redirect.searchParams.get('action')).toBe('blocked');
    expect(redirect.searchParams.get('reason')).toBe('AUTH_PERSISTENCE_UNAVAILABLE');
  });

  it('blocks duplicate email signup attempts for a different Kakao user id', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';

    const { app } = await loadApp();
    mockKakaoFetch({ id: 'first-id', email: 'duplicate@example.invalid', nickname: '첫회원' });
    const first = await app.request('/auth/kakao/callback?code=first-code');

    mockKakaoFetch({ id: 'second-id', email: 'duplicate@example.invalid', nickname: '두번째' });
    const duplicate = await app.request('/auth/kakao/callback?code=second-code');

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ action: 'blocked', reason: 'DUPLICATE_EMAIL', message: '이미 가입된 이메일입니다.' });
  });

  it('normalizes additional-info email case before duplicate checks', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    const { app } = await loadApp();
    mockKakaoFetch({ id: 'first-id', email: 'Member@Example.Invalid', nickname: '첫회원' });
    expect((await app.request('/auth/kakao/callback?code=first-code')).status).toBe(201);

    mockKakaoFetch({ id: 'second-id', nickname: '두번째' });
    const callback = await app.request('/auth/kakao/callback?code=second-code');
    const { continuationToken } = await callback.json() as { continuationToken: string };
    const duplicate = await app.request('/auth/kakao/additional-info', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ continuationToken, email: 'Member@Example.Invalid', displayName: '두번째' }),
    });

    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ action: 'blocked', reason: 'DUPLICATE_EMAIL' });
  });



  it('blocks duplicate phone signup attempts for a different Kakao user id', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';

    const { app } = await loadApp();
    mockKakaoFetch({ id: 'phone-first-id', email: 'phone-first@example.invalid', phone: '+82 10-9999-0000', nickname: '첫연락처' });
    const first = await app.request('/auth/kakao/callback?code=first-code');

    mockKakaoFetch({ id: 'phone-second-id', email: 'phone-second@example.invalid', phone: '+82 10-9999-0000', nickname: '두번째연락처' });
    const duplicate = await app.request('/auth/kakao/callback?code=second-code');

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ action: 'blocked', reason: 'DUPLICATE_PHONE', message: '이미 가입된 연락처입니다.' });
  });

  it('blocks re-login for locally withdrawn Kakao dev members with a policy response', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    mockKakaoFetch({ id: 'withdrawn-id', email: 'withdrawn@example.invalid', nickname: '탈퇴회원' });

    const { app, kakaoDevTestState } = await loadApp();
    const signup = await app.request('/auth/kakao/callback?code=first-code');
    await kakaoDevTestState.markWithdrawn('withdrawn-id');
    const relogin = await app.request('/auth/kakao/callback?code=second-code');

    expect(signup.status).toBe(201);
    expect(relogin.status).toBe(409);
    expect(await relogin.json()).toEqual({ action: 'blocked', reason: 'WITHDRAWN_MEMBER', message: '탈퇴 처리된 계정은 재가입 정책 확인 후 이용할 수 있습니다.' });
  });

  it('keeps logout and unlink explicit local blockers until persistent sessions and Kakao unlink are implemented', async () => {
    const { app } = await loadApp();

    const logout = await app.request('/auth/kakao/logout', { method: 'POST' });
    const unlink = await app.request('/auth/kakao/unlink', { method: 'POST' });

    expect(logout.status).toBe(501);
    expect(await logout.json()).toEqual({ action: 'logout_pending', reason: 'SESSION_STORE_NOT_IMPLEMENTED' });
    expect(unlink.status).toBe(501);
    expect(await unlink.json()).toEqual({ action: 'unlink_pending', reason: 'KAKAO_UNLINK_NOT_IMPLEMENTED' });
  });
});
