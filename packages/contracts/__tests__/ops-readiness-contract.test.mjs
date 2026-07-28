import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminAuditEventSchema,
  livenessResponseSchema,
  operationalEventSchema,
  operationalHealthResponseSchema,
  opsErrorDescriptorSchema,
  readinessResponseSchema,
} from '../dist/index.js';

test('health contracts preserve probes and add secret-free component readiness', () => {
  assert.deepEqual(livenessResponseSchema.parse({ status: 'ok' }), { status: 'ok' });
  assert.deepEqual(readinessResponseSchema.parse({ status: 'unavailable' }), { status: 'unavailable' });
  assert.deepEqual(
    operationalHealthResponseSchema.parse({
      status: 'ok',
      checks: { process: { status: 'ok' }, database: { status: 'ok' } },
    }),
    { status: 'ok', checks: { process: { status: 'ok' }, database: { status: 'ok' } } },
  );
});

test('operational errors encode domain and retry behavior without raw details', () => {
  assert.deepEqual(
    opsErrorDescriptorSchema.parse({
      domain: 'refund',
      code: 'REFUND_REVIEW_CONFLICT',
      retryable: false,
    }),
    { domain: 'refund', code: 'REFUND_REVIEW_CONFLICT', retryable: false },
  );
  assert.throws(() =>
    opsErrorDescriptorSchema.parse({
      domain: 'internal',
      code: 'INTERNAL_ERROR',
      retryable: true,
      rawError: 'must not be accepted',
    }),
  );
  assert.throws(() =>
    opsErrorDescriptorSchema.parse({
      domain: 'admin',
      code: 'REFUND_REVIEW_CONFLICT',
      retryable: false,
    }),
  );
});

test('request and admin audit events accept only redacted allowlisted fields', () => {
  const requestEvent = {
    timestamp: '2026-07-23T00:00:00.000Z',
    event: 'request.completed',
    level: 'info',
    outcome: 'success',
    requestId: 'request-1',
    method: 'GET',
    route: '/healthz',
    statusCode: 200,
    durationMs: 3,
  };
  assert.deepEqual(operationalEventSchema.parse(requestEvent), requestEvent);
  assert.throws(() =>
    operationalEventSchema.parse({
      ...requestEvent,
      authorization: 'Bearer forbidden',
      query: 'token=forbidden',
    }),
  );
  assert.throws(() =>
    operationalEventSchema.parse({
      ...requestEvent,
      route: '/healthz?token=forbidden',
    }),
  );

  const auditEvent = {
    timestamp: '2026-07-23T00:00:00.000Z',
    event: 'admin.action',
    level: 'info',
    outcome: 'success',
    requestId: 'request-2',
    action: 'payment.status.update',
    actorRef: 'operator:authenticated',
    subjectRef: 'payment:redacted',
  };
  assert.deepEqual(adminAuditEventSchema.parse(auditEvent), auditEvent);
  assert.throws(() =>
    adminAuditEventSchema.parse({
      ...auditEvent,
      subjectRef: 'payment_record_123',
    }),
  );
});
