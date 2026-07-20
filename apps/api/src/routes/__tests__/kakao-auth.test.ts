import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client.js', () => ({
  db: { execute: vi.fn() },
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
    vi.unstubAllGlobals();
    process.env.DATABASE_URL = 'postgres://user:pass@example.invalid:5432/db';
    process.env.API_BEARER_TOKEN = 'test';
    delete process.env.SERVICE_REST_API_KEY;
    delete process.env.KAKAO_CLIENT_SECRET;
    delete process.env.PUBLIC_AUTH_BASE_URL;
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

  it('routes email-missing Kakao accounts to additional info instead of creating a member', async () => {
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    mockKakaoFetch({ id: 777, nickname: '이메일없음' });

    const { app } = await loadApp();
    const res = await app.request('/auth/kakao/callback?code=mock-code');

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ action: 'additional_info_required', reason: 'EMAIL_MISSING', kakaoUserId: '777', next: '/auth/additional-info' });
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
    kakaoDevTestState.markWithdrawn('withdrawn-id');
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
