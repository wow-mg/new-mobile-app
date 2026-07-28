import { kakaoAdditionalInfoRequestSchema, kakaoAuthContinueRequestSchema, kakaoDevAuthSuccessSchema, type KakaoAdditionalInfoRequest, type KakaoAuthContinueRequest, type KakaoDevAuthSuccess } from '@template/contracts';

export type CompleteKakaoAdditionalInfo = (input: KakaoAdditionalInfoRequest) => Promise<KakaoDevAuthSuccess>;

export type KakaoAuthClient = { completeAdditionalInfo: CompleteKakaoAdditionalInfo; continueAuth(input: KakaoAuthContinueRequest): Promise<KakaoDevAuthSuccess> };
export function createKakaoAuthClient({ baseUrl, fetchImpl = fetch }: { baseUrl?: string; fetchImpl?: typeof fetch }): KakaoAuthClient {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, '');
  return {
    async completeAdditionalInfo(input) {
      if (!normalizedBaseUrl) throw new Error('KAKAO_AUTH_API_NOT_CONFIGURED');
      const response = await fetchImpl(`${normalizedBaseUrl}/auth/kakao/additional-info`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(kakaoAdditionalInfoRequestSchema.parse(input)),
      });
      const body = await response.json().catch(() => null) as { reason?: unknown } | null;
      if (!response.ok) throw new Error(typeof body?.reason === 'string' ? body.reason : `KAKAO_AUTH_HTTP_${response.status}`);
      return kakaoDevAuthSuccessSchema.parse(body);
    },
    async continueAuth(input) {
      if (!normalizedBaseUrl) throw new Error('KAKAO_AUTH_API_NOT_CONFIGURED');
      const response = await fetchImpl(`${normalizedBaseUrl}/auth/kakao/continue`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(kakaoAuthContinueRequestSchema.parse(input)) });
      const body = await response.json().catch(() => null) as { reason?: unknown } | null;
      if (!response.ok) throw new Error(typeof body?.reason === 'string' ? body.reason : `KAKAO_AUTH_HTTP_${response.status}`);
      return kakaoDevAuthSuccessSchema.parse(body);
    },
  };
}

export const defaultKakaoAuthClient = createKakaoAuthClient({ baseUrl: process.env.EXPO_PUBLIC_API_URL });
