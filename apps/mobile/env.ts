import Constants from 'expo-constants';
import { z } from 'zod';

const expoExtra = Constants.expoConfig?.extra ?? {};

const schema = z.object({
  APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
  APP_DISPLAY_NAME: z.string().min(1).default('Happickle'),
  API_URL: z.url(),
});

export const Env = schema.parse({
  APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  APP_DISPLAY_NAME: process.env.EXPO_PUBLIC_APP_DISPLAY_NAME ?? Constants.expoConfig?.name,
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? expoExtra.apiUrl,
});
