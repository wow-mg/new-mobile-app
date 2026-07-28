import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.url(),
  API_PORT: z.coerce.number().int().default(3000),
  API_BEARER_TOKEN: z.string().min(1),
  PARTICIPANT_PREVIEW_BEARER_TOKEN: z.string().min(1).optional(),
  OPERATOR_BEARER_TOKEN: z.string().min(1).optional(),
  PUBLIC_AUTH_BASE_URL: z.url().optional(),
  SERVICE_REST_API_KEY: z.string().min(1).optional(),
  KAKAO_CLIENT_SECRET: z.string().min(1).optional(),
  EXPO_PUBLIC_APP_SCHEME: z.string().regex(/^[a-z][a-z0-9+.-]*$/i).optional(),
  PAYMENT_PROVIDER_ENV: z.enum(['sandbox', 'dev-staging']).optional(),
  PAYMENT_PROVIDER_BASE_URL: z.url().optional(),
  PAYMENT_PROVIDER_MERCHANT_ID: z.string().min(1).optional(),
  PAYMENT_PROVIDER_SECRET: z.string().min(1).optional(),
});

export const Env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  API_PORT: process.env.API_PORT,
  API_BEARER_TOKEN: process.env.API_BEARER_TOKEN,
  PARTICIPANT_PREVIEW_BEARER_TOKEN: process.env.PARTICIPANT_PREVIEW_BEARER_TOKEN,
  OPERATOR_BEARER_TOKEN: process.env.OPERATOR_BEARER_TOKEN,
  PUBLIC_AUTH_BASE_URL: process.env.PUBLIC_AUTH_BASE_URL,
  SERVICE_REST_API_KEY: process.env.SERVICE_REST_API_KEY,
  KAKAO_CLIENT_SECRET: process.env.KAKAO_CLIENT_SECRET,
  EXPO_PUBLIC_APP_SCHEME: process.env.EXPO_PUBLIC_APP_SCHEME,
  PAYMENT_PROVIDER_ENV: process.env.PAYMENT_PROVIDER_ENV,
  PAYMENT_PROVIDER_BASE_URL: process.env.PAYMENT_PROVIDER_BASE_URL,
  PAYMENT_PROVIDER_MERCHANT_ID: process.env.PAYMENT_PROVIDER_MERCHANT_ID,
  PAYMENT_PROVIDER_SECRET: process.env.PAYMENT_PROVIDER_SECRET,
});
