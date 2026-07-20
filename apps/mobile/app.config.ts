import { ExpoConfig, ConfigContext } from 'expo/config';

type MobileExpoConfig = ExpoConfig & {
  newArchEnabled?: boolean;
};

function readConfigValue(name: string, fallback: string): string {
  const value = process.env[name];
  const requiresExplicitValue = process.env.EAS_BUILD === 'true'
    || process.env.EXPO_PUBLIC_APP_ENV === 'preview'
    || process.env.EXPO_PUBLIC_APP_ENV === 'production';

  if (value) return value;
  if (!requiresExplicitValue) return fallback;

  throw new Error(`${name} is required for preview, production, and EAS build config.`);
}

function readConfigUrl(name: string, fallback: string): string {
  const value = readConfigValue(name, fallback);
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL for preview, production, and EAS build config.`);
  }
  return value;
}

function hasConfigValue(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

// Read process.env directly here — @expo/config's evalConfig uses sucrase + require-from-string
// which cannot resolve TypeScript files via require('./env') in a monorepo with "type":"module"
// at the workspace root. Runtime code (src/) should continue to import from ./env.ts.
export default ({ config }: ConfigContext): MobileExpoConfig => ({
  ...config,
  name: readConfigValue('EXPO_PUBLIC_APP_DISPLAY_NAME', 'Happickle'),
  slug: readConfigValue('EXPO_PUBLIC_APP_SLUG', 'happickle-mobile'),
  scheme: readConfigValue('EXPO_PUBLIC_APP_SCHEME', 'happickle'),
  newArchEnabled: true,
  ios: { bundleIdentifier: readConfigValue('EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER', 'com.template.mobile') },
  android: { package: readConfigValue('EXPO_PUBLIC_ANDROID_PACKAGE', 'com.template.mobile') },
  plugins: ['expo-router'],
  extra: {
    apiUrl: readConfigUrl('EXPO_PUBLIC_API_URL', 'https://example.invalid'),
    eas: { projectId: process.env.EAS_PROJECT_ID },
    socialLogin: {
      kakao: {
        nativeAppKeyConfigured: hasConfigValue('SERVICE_NATIVE_APP_KEY'),
        restApiKeyConfigured: hasConfigValue('SERVICE_REST_API_KEY'),
        javascriptKeyConfigured: hasConfigValue('SERVICE_JAVASCRIPT_KEY'),
      },
    },
  },
});
