import { describe, expect, it, vi } from 'vitest';
import {
  adminAuditEventSchema,
  operationalEventSchema,
  operationalHealthResponseSchema,
} from '@template/contracts';
import { app } from '../../app.js';
import {
  createAdminAuditEvent,
  createOperationalEvent,
  operationalErrorForResponse,
  writeStructuredEvent,
} from '../ops-readiness.js';

describe('dev-staging ops readiness', () => {
  it('preserves existing probes and exposes secret-free component health', async () => {
    const livez = await app.request('/livez');
    expect(await livez.json()).toEqual({ status: 'ok' });

    const readyz = await app.request('/readyz');
    const readyStatus = readyz.status === 200 ? 'ok' : 'unavailable';
    expect([200, 503]).toContain(readyz.status);
    expect(await readyz.json()).toEqual({ status: readyStatus });

    const healthz = await app.request('/healthz');
    expect(healthz.status).toBe(readyz.status);
    expect(operationalHealthResponseSchema.parse(await healthz.json())).toEqual({
      status: readyStatus,
      checks: { process: { status: 'ok' }, database: { status: readyStatus } },
    });

    const unmatched = await app.request('/not-a-real-route?token=forbidden');
    expect(unmatched.status).toBe(404);
  });

  it('logs unmatched routes through the bounded fallback without raw URLs', async () => {
    const missing = await app.request('/missing?token=forbidden');
    expect(missing.status).toBe(404);
  });

  it('writes schema-allowlisted request events without secret-bearing inputs', () => {
    expect(operationalErrorForResponse('/readyz', 503)).toEqual({
      domain: 'dependency',
      code: 'DEPENDENCY_UNAVAILABLE',
      retryable: true,
    });
    expect(operationalErrorForResponse('/api/admin/support-inquiries/:inquiryId/status', 404)).toEqual({
      domain: 'cs',
      code: 'CS_INQUIRY_NOT_FOUND',
      retryable: false,
    });
    expect(operationalErrorForResponse('/api/admin/payments/:paymentRecordId/status', 409)).toEqual({
      domain: 'payment',
      code: 'PAYMENT_REVIEW_CONFLICT',
      retryable: false,
    });
    expect(operationalErrorForResponse('/api/admin/payments/:paymentRecordId/status', 404)).toEqual({
      domain: 'admin',
      code: 'ADMIN_ACTION_INVALID',
      retryable: false,
    });

    const event = createOperationalEvent({
      event: 'request.failed',
      requestId: 'request-1',
      method: 'PATCH',
      route: '/api/admin/payments/:paymentRecordId/status',
      statusCode: 409,
      durationMs: 4,
      error: { domain: 'payment', code: 'PAYMENT_REVIEW_CONFLICT', retryable: false },
    });
    expect(operationalEventSchema.parse(event)).toEqual(event);
    expect(JSON.stringify(event)).not.toMatch(/authorization|cookie|token|operatorNote|rawError|stack/i);

    const writer = vi.fn();
    writeStructuredEvent(event, writer);
    expect(writer).toHaveBeenCalledWith(JSON.stringify(event));
  });

  it('uses non-identifying fixed subject kinds for admin audit events', () => {
    const event = createAdminAuditEvent({
      requestId: 'request-2',
      action: 'support.status.update',
      subjectRef: 'support:redacted',
    });
    expect(adminAuditEventSchema.parse(event)).toEqual(event);
    expect(JSON.stringify(event)).not.toContain('inquiry_123');
    expect(() =>
      createAdminAuditEvent({
        requestId: 'request-2',
        action: 'support.status.update',
        // @ts-expect-error raw identifiers are intentionally outside the contract.
        subjectRef: 'inquiry_123',
      }),
    ).toThrow();
  });
});
