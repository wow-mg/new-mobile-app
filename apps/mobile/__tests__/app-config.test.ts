import appConfig from '../app.config';

const originalEnv = { ...process.env };
const configEnvKeys = [
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_APP_DISPLAY_NAME',
  'EXPO_PUBLIC_APP_SLUG',
  'EXPO_PUBLIC_APP_SCHEME',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER',
  'EXPO_PUBLIC_ANDROID_PACKAGE',
  'EAS_BUILD',
  'SERVICE_NATIVE_APP_KEY',
  'SERVICE_REST_API_KEY',
  'SERVICE_JAVASCRIPT_KEY',
];

function setRequiredProductionIdentity() {
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  process.env.EXPO_PUBLIC_APP_DISPLAY_NAME = 'Example App';
  process.env.EXPO_PUBLIC_APP_SLUG = 'example-app';
  process.env.EXPO_PUBLIC_APP_SCHEME = 'exampleapp';
  process.env.EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER = 'com.example.app';
  process.env.EXPO_PUBLIC_ANDROID_PACKAGE = 'com.example.app';
}

function resolveConfig() {
  return appConfig({ config: {} } as Parameters<typeof appConfig>[0]);
}

describe('Expo app config', () => {
  beforeEach(() => {
    for (const key of configEnvKeys) delete process.env[key];
  });

  afterAll(() => {
    for (const key of configEnvKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('uses PickleHub/Happickle defaults for local development config', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.invalid';

    expect(resolveConfig()).toMatchObject({
      name: 'Happickle',
      slug: 'happickle-mobile',
      scheme: 'happickle',
    });
  });

  it('requires API URL for production config', () => {
    setRequiredProductionIdentity();
    process.env.EXPO_PUBLIC_API_URL = '';

    expect(() => resolveConfig()).toThrow('EXPO_PUBLIC_API_URL is required');
  });

  it('requires a valid API URL for production config', () => {
    setRequiredProductionIdentity();
    process.env.EXPO_PUBLIC_API_URL = 'not-a-url';

    expect(() => resolveConfig()).toThrow('EXPO_PUBLIC_API_URL must be a valid URL');
  });

  it('exposes API URL in production config extras', () => {
    setRequiredProductionIdentity();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.invalid';

    expect(resolveConfig().extra).toMatchObject({
      apiUrl: 'https://api.example.invalid',
    });
  });

  it('exposes only Kakao key-presence booleans when provider config is absent', () => {
    expect(resolveConfig().extra).toMatchObject({
      socialLogin: {
        kakao: {
          nativeAppKeyConfigured: false,
          restApiKeyConfigured: false,
          javascriptKeyConfigured: false,
        },
      },
    });
  });

  it('exposes only Kakao key-presence booleans when provider config is supplied', () => {
    process.env.SERVICE_NATIVE_APP_KEY = 'placeholder-native-key';
    process.env.SERVICE_REST_API_KEY = 'placeholder-rest-key';
    process.env.SERVICE_JAVASCRIPT_KEY = 'placeholder-javascript-key';

    const config = resolveConfig();

    expect(config.extra).toMatchObject({
      socialLogin: {
        kakao: {
          nativeAppKeyConfigured: true,
          restApiKeyConfigured: true,
          javascriptKeyConfigured: true,
          authStartUrl: 'https://example.invalid/auth/kakao',
        },
      },
    });
    expect(JSON.stringify(config.extra)).not.toContain('placeholder-');
  });
});
