import Constants from 'expo-constants';
import type { KakaoAuthCallbackRedirect, KakaoDevAuthSuccess } from '@template/contracts';

export type KakaoConfigPresence = {
  nativeAppKeyConfigured: boolean;
  restApiKeyConfigured: boolean;
  javascriptKeyConfigured: boolean;
  authStartUrl?: string;
};

export type SocialLoginConfig = {
  kakao: KakaoConfigPresence;
  appleConfigured: boolean;
};

export type KakaoCallbackResult = KakaoAuthCallbackRedirect | KakaoDevAuthSuccess | { error: string; message?: string };

type SocialLoginExtra = {
  socialLogin?: {
    kakao?: Partial<KakaoConfigPresence>;
  };
};

const unavailableKakaoConfig: KakaoConfigPresence = {
  nativeAppKeyConfigured: false,
  restApiKeyConfigured: false,
  javascriptKeyConfigured: false,
};

export function getSocialLoginConfig(extra: SocialLoginExtra = Constants.expoConfig?.extra ?? {}): SocialLoginConfig {
  const kakao = extra.socialLogin?.kakao;

  return {
    kakao: {
      nativeAppKeyConfigured: kakao?.nativeAppKeyConfigured === true,
      restApiKeyConfigured: kakao?.restApiKeyConfigured === true,
      javascriptKeyConfigured: kakao?.javascriptKeyConfigured === true,
      authStartUrl: typeof kakao?.authStartUrl === 'string' && kakao.authStartUrl.startsWith('http') ? kakao.authStartUrl : undefined,
    },
    appleConfigured: false,
  };
}

export function describeSocialLoginAvailability(config: SocialLoginConfig): string {
  if (config.kakao.authStartUrl) {
    return '';
  }

  const configuredKeyCount = [config.kakao.nativeAppKeyConfigured, config.kakao.restApiKeyConfigured, config.kakao.javascriptKeyConfigured].filter(Boolean).length;

  if (configuredKeyCount === Object.keys(unavailableKakaoConfig).length) {
    return '카카오 설정 키가 감지되었지만 서버 OAuth 시작 경로가 아직 없습니다.';
  }

  if (configuredKeyCount > 0) {
    return '카카오 설정 키가 일부 감지되었지만 서버 OAuth 시작 경로가 아직 없습니다.';
  }

  return '카카오 설정 키가 아직 전달되지 않았습니다. 소셜 로그인은 준비 중입니다.';
}


export function describeKakaoCallbackResult(result: KakaoCallbackResult | null | undefined): string | undefined {
  if (!result) return undefined;

  if ('error' in result) {
    if (result.error === 'KAKAO_AUTH_CODE_MISSING') return result.message ?? '카카오 인증 코드가 없습니다. 다시 시도해 주세요.';
    if (result.error === 'KAKAO_REST_API_KEY_NOT_CONFIGURED') return '카카오 로그인 서버 설정이 아직 준비되지 않았습니다.';
    return result.message ?? '카카오 로그인 확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (result.action === 'additional_info_required') {
    return '카카오 계정에 필수 정보가 부족해요. 이메일 등 추가 정보를 확인한 뒤 가입을 계속합니다.';
  }

  if (result.action === 'auth_complete') return '카카오 로그인을 확인하고 있습니다.';

  if (result.action === 'blocked') {
    if (result.reason === 'DUPLICATE_EMAIL') return result.message ? `${result.message} 기존 계정으로 로그인해 주세요.` : '이미 가입된 이메일입니다. 기존 계정으로 로그인해 주세요.';
    if (result.reason === 'DUPLICATE_PHONE') return result.message ? `${result.message} 기존 계정으로 로그인하거나 1:1 문의로 연락처 확인을 요청해 주세요.` : '이미 가입된 연락처입니다. 기존 계정으로 로그인하거나 1:1 문의로 확인해 주세요.';
    if (result.reason === 'WITHDRAWN_MEMBER') return result.message ? `${result.message} 1:1 문의로 재가입 가능 여부를 확인해 주세요.` : '탈퇴 처리된 계정은 운영자 확인 후 다시 이용할 수 있어요. 1:1 문의로 재가입 가능 여부를 확인해 주세요.';
    return result.message ?? '카카오 계정 확인이 차단되었습니다. 1:1 문의로 확인해 주세요.';
  }

  if (result.action === 'signup') return '카카오 가입이 확인되었습니다.';
  return '카카오 로그인이 확인되었습니다.';
}
