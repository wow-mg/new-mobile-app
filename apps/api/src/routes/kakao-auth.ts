import { Hono } from 'hono';
import { Env } from '../env.js';

const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USERINFO_URL = 'https://kapi.kakao.com/v2/user/me';
const KAKAO_CALLBACK_PATH = '/auth/kakao/callback';

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

type DevMember = {
  memberId: string;
  kakaoUserId: string;
  email?: string;
  phone?: string;
  displayName: string;
  status: 'active' | 'withdrawn';
};

const devMembersByKakaoId = new Map<string, DevMember>();
const devKakaoIdByEmail = new Map<string, string>();
const devKakaoIdByPhone = new Map<string, string>();

function getPublicBaseUrl(c: { req: { header: (name: string) => string | undefined; url: string } }) {
  const configuredBaseUrl = Env.PUBLIC_AUTH_BASE_URL?.replace(/\/$/, '');
  if (configuredBaseUrl) return configuredBaseUrl;

  const forwardedProto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  const forwardedHost = c.req.header('x-forwarded-host') ?? c.req.header('host');
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  return new URL(c.req.url).origin;
}

function createKakaoAuthorizeUrl(baseUrl: string) {
  const url = new URL(KAKAO_AUTHORIZE_URL);
  url.searchParams.set('client_id', Env.SERVICE_REST_API_KEY ?? '');
  url.searchParams.set('redirect_uri', `${baseUrl}${KAKAO_CALLBACK_PATH}`);
  url.searchParams.set('response_type', 'code');
  return url;
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

function issueDevSession(member: DevMember) {
  return {
    kind: 'dev-session',
    accessToken: `dev-session:${member.memberId}`,
    memberId: member.memberId,
  };
}

function continueDevLogin(profile: { kakaoUserId: string; email?: string; phone?: string; displayName: string }) {
  const existingMember = devMembersByKakaoId.get(profile.kakaoUserId);
  if (existingMember) {
    if (existingMember.status === 'withdrawn') {
      return { action: 'blocked' as const, reason: 'WITHDRAWN_MEMBER', message: '탈퇴 처리된 계정은 재가입 정책 확인 후 이용할 수 있습니다.' };
    }
    return { action: 'login' as const, member: existingMember, session: issueDevSession(existingMember) };
  }

  if (!profile.email) {
    return { action: 'additional_info_required' as const, reason: 'EMAIL_MISSING', kakaoUserId: profile.kakaoUserId };
  }

  const duplicatedEmailKakaoId = devKakaoIdByEmail.get(profile.email);
  if (duplicatedEmailKakaoId && duplicatedEmailKakaoId !== profile.kakaoUserId) {
    return { action: 'blocked' as const, reason: 'DUPLICATE_EMAIL', message: '이미 가입된 이메일입니다.' };
  }

  const duplicatedPhoneKakaoId = profile.phone ? devKakaoIdByPhone.get(profile.phone) : undefined;
  if (duplicatedPhoneKakaoId && duplicatedPhoneKakaoId !== profile.kakaoUserId) {
    return { action: 'blocked' as const, reason: 'DUPLICATE_PHONE', message: '이미 가입된 연락처입니다.' };
  }

  const member: DevMember = {
    memberId: `dev-member-${profile.kakaoUserId}`,
    kakaoUserId: profile.kakaoUserId,
    email: profile.email,
    phone: profile.phone,
    displayName: profile.displayName,
    status: 'active',
  };
  devMembersByKakaoId.set(profile.kakaoUserId, member);
  devKakaoIdByEmail.set(profile.email, profile.kakaoUserId);
  if (profile.phone) devKakaoIdByPhone.set(profile.phone, profile.kakaoUserId);

  return { action: 'signup' as const, member, session: issueDevSession(member) };
}

export const kakaoAuthRoute = new Hono()
  .get('/kakao', (c) => {
    if (!Env.SERVICE_REST_API_KEY) {
      return c.json({ error: 'KAKAO_REST_API_KEY_NOT_CONFIGURED' }, 503);
    }

    return c.redirect(createKakaoAuthorizeUrl(getPublicBaseUrl(c)).toString(), 302);
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

    const result = continueDevLogin(userInfo);
    if (result.action === 'additional_info_required') {
      return c.json({ action: result.action, reason: result.reason, kakaoUserId: result.kakaoUserId, next: '/auth/additional-info' }, 202);
    }
    if (result.action === 'blocked') {
      return c.json({ action: result.action, reason: result.reason, message: result.message }, 409);
    }

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
    devMembersByKakaoId.clear();
    devKakaoIdByEmail.clear();
    devKakaoIdByPhone.clear();
  },
  markWithdrawn(kakaoUserId: string) {
    const member = devMembersByKakaoId.get(kakaoUserId);
    if (member) devMembersByKakaoId.set(kakaoUserId, { ...member, status: 'withdrawn' });
  },
};
