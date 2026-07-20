import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.url(),
  API_PORT: z.coerce.number().int().default(3000),
  API_BEARER_TOKEN: z.string().min(1),
  PARTICIPANT_PREVIEW_BEARER_TOKEN: z.string().min(1).optional(),
  PUBLIC_AUTH_BASE_URL: z.url().optional(),
  SERVICE_REST_API_KEY: z.string().min(1).optional(),
});

export const Env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  API_PORT: process.env.API_PORT,
  API_BEARER_TOKEN: process.env.API_BEARER_TOKEN,
  PARTICIPANT_PREVIEW_BEARER_TOKEN: process.env.PARTICIPANT_PREVIEW_BEARER_TOKEN,
  PUBLIC_AUTH_BASE_URL: process.env.PUBLIC_AUTH_BASE_URL,
  SERVICE_REST_API_KEY: process.env.SERVICE_REST_API_KEY,
});
