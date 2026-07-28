import {
  adminAuditEventSchema,
  operationalEventSchema,
  type AdminAuditEvent,
  type OperationalEvent,
  type OpsErrorDescriptor,
} from '@template/contracts';
import type { MiddlewareHandler } from 'hono';

type EventWriter = (line: string) => void;

type OperationalEventInput = Pick<
  OperationalEvent,
  'event' | 'requestId' | 'method' | 'route' | 'statusCode' | 'durationMs'
> & {
  error?: OpsErrorDescriptor;
};

type AdminAuditEventInput = Pick<
  AdminAuditEvent,
  'requestId' | 'action' | 'subjectRef'
> & {
  error?: OpsErrorDescriptor;
};

const safeRequestId = /^[A-Za-z0-9._-]{1,64}$/;

export function requestIdFromHeader(value: string | undefined) {
  return value && safeRequestId.test(value) ? value : crypto.randomUUID();
}

export function createOperationalEvent(input: OperationalEventInput): OperationalEvent {
  const failure = input.event === 'request.failed';
  return operationalEventSchema.parse({
    timestamp: new Date().toISOString(),
    ...input,
    level: failure ? 'error' : 'info',
    outcome: failure ? 'failure' : 'success',
  });
}

export function createAdminAuditEvent(input: AdminAuditEventInput): AdminAuditEvent {
  const failure = Boolean(input.error);
  return adminAuditEventSchema.parse({
    timestamp: new Date().toISOString(),
    event: 'admin.action',
    ...input,
    level: failure ? 'error' : 'info',
    outcome: failure ? 'failure' : 'success',
    actorRef: 'operator:authenticated',
  });
}

export function writeStructuredEvent(
  event: OperationalEvent | AdminAuditEvent,
  writer: EventWriter = console.info,
) {
  writer(JSON.stringify(event));
}

export function operationalErrorForResponse(
  route: string,
  statusCode: number,
): OpsErrorDescriptor | undefined {
  if ((route === '/readyz' || route === '/healthz') && statusCode === 503) {
    return { domain: 'dependency', code: 'DEPENDENCY_UNAVAILABLE', retryable: true };
  }
  if (route.startsWith('/api/admin/')) {
    if (statusCode === 401 || statusCode === 403) {
      return { domain: 'admin', code: 'ADMIN_ACTION_FORBIDDEN', retryable: false };
    }
    if (route.includes('/support-inquiries/') && statusCode === 404) {
      return { domain: 'cs', code: 'CS_INQUIRY_NOT_FOUND', retryable: false };
    }
    if (route.includes('/payments/') && statusCode === 409) {
      return { domain: 'payment', code: 'PAYMENT_REVIEW_CONFLICT', retryable: false };
    }
    if (route.includes('/refunds/') && statusCode === 409) {
      return { domain: 'refund', code: 'REFUND_REVIEW_CONFLICT', retryable: false };
    }
    if (statusCode === 400 || statusCode === 404 || statusCode === 409) {
      return { domain: 'admin', code: 'ADMIN_ACTION_INVALID', retryable: false };
    }
  }
  return statusCode >= 500
    ? { domain: 'internal', code: 'INTERNAL_ERROR', retryable: true }
    : undefined;
}

export function operationalRequestLogger(writer: EventWriter = console.info): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = Date.now();
    const requestId = requestIdFromHeader(c.req.header('x-request-id'));
    c.header('x-request-id', requestId);

    try {
      await next();
      const failed = c.res.status >= 400;
      const route = c.req.routePath || '/unmatched';
      writeStructuredEvent(createOperationalEvent({
        event: failed ? 'request.failed' : 'request.completed',
        requestId,
        method: c.req.method,
        route,
        statusCode: c.res.status,
        durationMs: Date.now() - startedAt,
        error: operationalErrorForResponse(route, c.res.status),
      }), writer);
    } catch (error) {
      writeStructuredEvent(createOperationalEvent({
        event: 'request.failed',
        requestId,
        method: c.req.method,
        route: c.req.routePath || '/unmatched',
        statusCode: 500,
        durationMs: Date.now() - startedAt,
        error: { domain: 'internal', code: 'INTERNAL_ERROR', retryable: true },
      }), writer);
      throw error;
    }
  };
}
