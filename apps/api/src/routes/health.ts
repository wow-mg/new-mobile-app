import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import {
  livenessResponseSchema,
  operationalHealthResponseSchema,
  readinessResponseSchema,
} from '@template/contracts';
import { db } from '../db/client.js';

export const healthRoute = new Hono()
  .get('/livez', (c) => c.json(livenessResponseSchema.parse({ status: 'ok' })))
  .get('/readyz', async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json(readinessResponseSchema.parse({ status: 'ok' }));
    } catch {
      return c.json(readinessResponseSchema.parse({ status: 'unavailable' }), 503);
    }
  })
  .get('/healthz', async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json(operationalHealthResponseSchema.parse({
        status: 'ok',
        checks: { process: { status: 'ok' }, database: { status: 'ok' } },
      }));
    } catch {
      return c.json(operationalHealthResponseSchema.parse({
        status: 'unavailable',
        checks: { process: { status: 'ok' }, database: { status: 'unavailable' } },
      }), 503);
    }
  });
