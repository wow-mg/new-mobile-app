import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { kakaoAdditionalInfoRequestSchema, kakaoAuthContinueRequestSchema } from '@template/contracts';
import { Env } from '../env.js';
import { findOrCreateKakaoMember, markKakaoMemberWithdrawn, type KakaoMember } from '../services/kakao-identity.service.js';

const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USERINFO_URL = 'https://kapi.kakao.com/v2/user/me';
const KAKAO_CALLBACK_PATH = '/auth/kakao/callback';
const DEV_AUTH_HANDOFF_TTL_MS = 10 * 60 * 1000;

type KakaoTokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  error?: unknown;
  error_description?: unknown;
};

type KakaoAccountProfile = {
  nickname?: unknown;
};

type KakaoAccount = {
  email?: unknown;
  phone_number?: unknown;
  profile?: KakaoAccountProfile;
};

type KakaoUserInfoResponse = {
  id?: unknown;
  kakao_account?: KakaoAccount;
};

const pendingDevProfilesByToken = new Map<string, { profile: { kakaoUserId: string; phone?: string; displayName: string }; expiresAt: number }>();
const devMobileReturnsByOauthState = new Map<string, { returnTo: string; expiresAt: number }>();
const pendingDevAuthOutcomes = new Map<string, { result: Extract<Awaited<ReturnType<typeof continueDevLogin>>, { action: 'login' | 'signup' }>; expiresAt: number }>();

function getPublicBaseUrl(c: { req: { header: (name: string) => string | undefined; url: string } }) {
  const configuredBaseUrl = Env.PUBLIC_AUTH_BASE_URL?.replace(/\/$/, '');
  if (configuredBaseUrl) return configuredBaseUrl;

  const forwardedProto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  const forwardedHost = c.req.header('x-forwarded-host') ?? c.req.header('host');
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  return new URL(c.req.url).origin;
}

function safeDevMobileReturnTo(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    const isAllowedNativeReturn = Boolean(Env.EXPO_PUBLIC_APP_SCHEME) && url.protocol === `${Env.EXPO_PUBLIC_APP_SCHEME}:`;
    const isAllowedDevWebReturn = url.protocol === 'https:' && url.hostname === 'picklehub-mobile-dev-production.up.railway.app';
    if (!isAllowedNativeReturn && !isAllowedDevWebReturn) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function createKakaoAuthorizeUrl(baseUrl: string, returnTo?: string) {
  const url = new URL(KAKAO_AUTHORIZE_URL);
  url.searchParams.set('client_id', Env.SERVICE_REST_API_KEY ?? '');
  url.searchParams.set('redirect_uri', `${baseUrl}${KAKAO_CALLBACK_PATH}`);
  url.searchParams.set('response_type', 'code');
  if (returnTo) {
    const state = randomUUID();
    devMobileReturnsByOauthState.set(state, { returnTo, expiresAt: Date.now() + DEV_AUTH_HANDOFF_TTL_MS });
    url.searchParams.set('state', state);
  }
  return url;
}

function consumeDevMobileReturn(state: string | undefined) {
  if (!state) return undefined;
  const pending = devMobileReturnsByOauthState.get(state);
  devMobileReturnsByOauthState.delete(state);
  return pending && pending.expiresAt > Date.now() ? pending.returnTo : undefined;
}

function isConfiguredForKakaoCallback() {
  return Boolean(Env.SERVICE_REST_API_KEY);
}

function safeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

async function exchangeKakaoCode(code: string, redirectUri: string) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: Env.SERVICE_REST_API_KEY ?? '',
    redirect_uri: redirectUri,
    code,
  });
  if (Env.KAKAO_CLIENT_SECRET) form.set('client_secret', Env.KAKAO_CLIENT_SECRET);

  const response = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: form,
  });
  const payload = (await response.json()) as KakaoTokenResponse;
  if (!response.ok) {
    return { ok: false as const, error: 'KAKAO_TOKEN_EXCHANGE_FAILED', providerStatus: response.status };
  }

  const accessToken = safeString(payload.access_token);
  if (!accessToken) {
    return { ok: false as const, error: 'KAKAO_TOKEN_MISSING' };
  }

  return { ok: true as const, accessToken };
}

async function fetchKakaoUserInfo(accessToken: string) {
  const response = await fetch(KAKAO_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json()) as KakaoUserInfoResponse;
  if (!response.ok) {
    return { ok: false as const, error: 'KAKAO_USERINFO_FAILED', providerStatus: response.status };
  }

  const kakaoUserId = typeof payload.id === 'number' || typeof payload.id === 'string' ? String(payload.id) : undefined;
  if (!kakaoUserId) {
    return { ok: false as const, error: 'KAKAO_USER_ID_MISSING' };
  }

  return {
    ok: true as const,
    kakaoUserId,
    email: safeString(payload.kakao_account?.email),
    phone: safeString(payload.kakao_account?.phone_number),
    displayName: safeString(payload.kakao_account?.profile?.nickname) ?? 'Kakao member',
  };
}

function issueDevSession(member: KakaoMember) {
  return {
    kind: 'dev-session',
    accessToken: `dev-session:${member.memberId}`,
    memberId: member.memberId,
  };
}

async function continueDevLogin(profile: { kakaoUserId: string; email?: string; phone?: string; displayName: string }) {
  const normalizedEmail = profile.email?.trim().toLowerCase();
  const result = await findOrCreateKakaoMember({ ...profile, email: normalizedEmail });
  if (result.action === 'additional_info_required') {
    const continuationToken = randomUUID();
    pendingDevProfilesByToken.set(continuationToken, {
      profile: { kakaoUserId: profile.kakaoUserId, phone: profile.phone, displayName: profile.displayName },
      expiresAt: Date.now() + DEV_AUTH_HANDOFF_TTL_MS,
    });
    return { action: 'additional_info_required' as const, reason: 'EMAIL_MISSING', kakaoUserId: profile.kakaoUserId, continuationToken };
  }
  return result.action === 'blocked' ? result : { ...result, session: issueDevSession(result.member) };
}

export const kakaoAuthRoute = new Hono()
  .get('/kakao', (c) => {
    if (!Env.SERVICE_REST_API_KEY) {
      return c.json({ error: 'KAKAO_REST_API_KEY_NOT_CONFIGURED' }, 503);
    }

    return c.redirect(createKakaoAuthorizeUrl(getPublicBaseUrl(c), safeDevMobileReturnTo(c.req.query('returnTo'))).toString(), 302);
  })
  .get('/kakao/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) return c.json({ error: 'KAKAO_AUTH_CODE_MISSING', message: '카카오 인증 코드가 없습니다.' }, 400);
    if (!isConfiguredForKakaoCallback()) return c.json({ error: 'KAKAO_REST_API_KEY_NOT_CONFIGURED' }, 503);

    const redirectUri = `${getPublicBaseUrl(c)}${KAKAO_CALLBACK_PATH}`;
    const token = await exchangeKakaoCode(code, redirectUri);
    if (!token.ok) return c.json(token, token.providerStatus === 400 ? 400 : 502);

    const userInfo = await fetchKakaoUserInfo(token.accessToken);
    if (!userInfo.ok) return c.json(userInfo, userInfo.providerStatus === 400 ? 400 : 502);

    const returnTo = consumeDevMobileReturn(c.req.query('state'));
    let result;
    try { result = await continueDevLogin(userInfo); }
    catch {
      const blocked = { action: 'blocked' as const, reason: 'AUTH_PERSISTENCE_UNAVAILABLE', message: '로그인 정보를 저장할 수 없습니다.' };
      if (returnTo) {
        const redirect = new URL(returnTo);
        redirect.searchParams.set('action', blocked.action);
        redirect.searchParams.set('reason', blocked.reason);
        redirect.searchParams.set('message', blocked.message);
        return c.redirect(redirect.toString(), 302);
      }
      return c.json(blocked, 503);
    }
    if (result.action === 'additional_info_required') {
      if (returnTo) {
        const redirect = new URL(returnTo);
        redirect.searchParams.set('action', result.action);
        redirect.searchParams.set('reason', result.reason);
        redirect.searchParams.set('continuationToken', result.continuationToken);
        redirect.searchParams.set('next', '/auth/additional-info');
        return c.redirect(redirect.toString(), 302);
      }
      return c.json({ action: result.action, reason: result.reason, kakaoUserId: result.kakaoUserId, continuationToken: result.continuationToken, next: '/auth/additional-info' }, 202);
    }
    if (result.action === 'blocked') {
      if (returnTo) {
        const redirect = new URL(returnTo);
        redirect.searchParams.set('action', result.action);
        redirect.searchParams.set('reason', result.reason);
        redirect.searchParams.set('message', result.message);
        return c.redirect(redirect.toString(), 302);
      }
      return c.json({ action: result.action, reason: result.reason, message: result.message }, 409);
    }

    if (returnTo) {
      const outcomeId = randomUUID();
      pendingDevAuthOutcomes.set(outcomeId, { result, expiresAt: Date.now() + DEV_AUTH_HANDOFF_TTL_MS });
      const redirect = new URL(returnTo);
      redirect.searchParams.set('action', 'auth_complete');
      redirect.searchParams.set('outcomeId', outcomeId);
      return c.redirect(redirect.toString(), 302);
    }
    return c.json({ action: result.action, member: result.member, session: result.session }, result.action === 'signup' ? 201 : 200);
  })
  .post('/kakao/continue', zValidator('json', kakaoAuthContinueRequestSchema), (c) => {
    const { outcomeId } = c.req.valid('json');
    const pending = pendingDevAuthOutcomes.get(outcomeId);
    pendingDevAuthOutcomes.delete(outcomeId);
    if (!pending || pending.expiresAt <= Date.now()) return c.json({ action: 'blocked' as const, reason: 'AUTH_OUTCOME_NOT_PENDING', message: '로그인 계속 요청이 만료되었거나 유효하지 않습니다.' }, 409);
    return c.json(pending.result, pending.result.action === 'signup' ? 201 : 200);
  })
  .post('/kakao/additional-info', zValidator('json', kakaoAdditionalInfoRequestSchema), async (c) => {
    const input = c.req.valid('json');
    const pending = pendingDevProfilesByToken.get(input.continuationToken);
    if (!pending || pending.expiresAt <= Date.now()) {
      pendingDevProfilesByToken.delete(input.continuationToken);
      return c.json({ action: 'blocked' as const, reason: 'ADDITIONAL_INFO_NOT_PENDING', message: '추가 정보 입력 요청이 만료되었거나 유효하지 않습니다.' }, 409);
    }
    let result;
    try { result = await continueDevLogin({ ...pending.profile, email: input.email, phone: input.phone ?? pending.profile.phone, displayName: input.displayName }); }
    catch { return c.json({ action: 'blocked' as const, reason: 'AUTH_PERSISTENCE_UNAVAILABLE', message: '로그인 정보를 저장할 수 없습니다.' }, 503); }
    if (result.action === 'blocked') return c.json({ action: result.action, reason: result.reason, message: result.message }, 409);
    if (result.action === 'additional_info_required') return c.json({ action: 'blocked' as const, reason: 'EMAIL_MISSING', message: '이메일을 확인해 주세요.' }, 400);
    pendingDevProfilesByToken.delete(input.continuationToken);
    return c.json({ action: result.action, member: result.member, session: result.session }, result.action === 'signup' ? 201 : 200);
  })
  .post('/kakao/logout', (c) => c.json({ action: 'logout_pending', reason: 'SESSION_STORE_NOT_IMPLEMENTED' }, 501))
  .post('/kakao/unlink', (c) => c.json({ action: 'unlink_pending', reason: 'KAKAO_UNLINK_NOT_IMPLEMENTED' }, 501));

export const KAKAO_AUTH_ROUTE_MARKERS = {
  authorizeHost: 'kauth.kakao.com',
  tokenHost: 'kauth.kakao.com',
  userInfoHost: 'kapi.kakao.com',
  startPath: '/auth/kakao',
  callbackPath: KAKAO_CALLBACK_PATH,
} as const;

export const __kakaoAuthDevTestState = {
  reset() {
    pendingDevProfilesByToken.clear();
    devMobileReturnsByOauthState.clear();
    pendingDevAuthOutcomes.clear();
  },
  markWithdrawn: markKakaoMemberWithdrawn,
  expireAdditionalInfo(continuationToken: string) {
    const pending = pendingDevProfilesByToken.get(continuationToken);
    if (pending) pendingDevProfilesByToken.set(continuationToken, { ...pending, expiresAt: 0 });
  },
};
