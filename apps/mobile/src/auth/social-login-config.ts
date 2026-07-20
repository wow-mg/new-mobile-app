import Constants from 'expo-constants';

export type KakaoConfigPresence = {
  nativeAppKeyConfigured: boolean;
  restApiKeyConfigured: boolean;
  javascriptKeyConfigured: boolean;
};

export type SocialLoginConfig = {
  kakao: KakaoConfigPresence;
  appleConfigured: boolean;
};

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
    },
    appleConfigured: false,
  };
}

export function describeSocialLoginAvailability(config: SocialLoginConfig): string {
  const configuredKeyCount = Object.values(config.kakao).filter(Boolean).length;

  if (configuredKeyCount === Object.keys(unavailableKakaoConfig).length) {
    return '카카오 설정 키가 감지되었습니다. 실제 카카오 연동은 아직 준비 중입니다.';
  }

  if (configuredKeyCount > 0) {
    return '카카오 설정 키가 일부 감지되었습니다. 실제 카카오 연동은 아직 준비 중입니다.';
  }

  return '카카오 설정 키가 아직 전달되지 않았습니다. 소셜 로그인은 준비 중입니다.';
}
