import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { zValidator } from '@hono/zod-validator';
import { adminApiErrorResponseSchema, approveRefundRequestSchema, rejectRefundRequestSchema, requestProviderRefundSchema, updateAdminMemberStatusRequestSchema, updateAdminPaymentStatusRequestSchema, updateAdminSupportInquiryStatusRequestSchema } from '@template/contracts';
import { Env } from '../env.js';
import { AdminOperatorError, getAdminMember, getAdminTournamentApplication, listAdminMembers, listAdminPaymentRecords, listAdminRefundRecords, listAdminSupportInquiries, listAdminTournamentApplications, updateAdminMemberStatus, updateAdminPaymentRecord, updateAdminSupportInquiryStatus } from '../services/admin-operator.service.js';
import { createAdminAuditEvent, operationalErrorForResponse, requestIdFromHeader, writeStructuredEvent } from './ops-readiness.js';
import { getRefundService, RefundServiceError } from '../services/refund.service.js';

const operatorTokens = [Env.OPERATOR_BEARER_TOKEN, process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' ? 'operator-test' : undefined].filter((token): token is string => Boolean(token));
const adminAuth = operatorTokens.length > 0 ? bearerAuth({ token: operatorTokens }) : async (c: any, next: () => Promise<void>) => c.json(adminApiErrorResponseSchema.parse({ error: 'ADMIN_API_DEV_STAGING_ONLY' }), 403);
const refundAdminAuth = async (c: any, next: () => Promise<void>) => {
  if (operatorTokens.length === 0) {
    return c.json(adminApiErrorResponseSchema.parse({ error: 'ADMIN_API_DEV_STAGING_ONLY' }), 403);
  }
  const authorization = c.req.header('authorization');
  if (!operatorTokens.some((token) => authorization === `Bearer ${token}`)) {
    return c.json(adminApiErrorResponseSchema.parse({ error: 'ADMIN_API_FORBIDDEN' }), 403);
  }
  await next();
};

function mapAdminError(error: unknown) {
  if (error instanceof AdminOperatorError) return { body: adminApiErrorResponseSchema.parse({ error: error.message }), status: error.status };
  if (error instanceof RefundServiceError) {
    return { body: adminApiErrorResponseSchema.parse({ error: error.code }), status: error.status };
  }
  throw error;
}

function auditRequestId(header: string | undefined) {
  return requestIdFromHeader(header);
}

export const adminOperatorRoute = new Hono()
  .use('/refunds/*', refundAdminAuth)
  .post('/refunds/:refundRequestId/approve', zValidator('json', approveRefundRequestSchema), async (c) => {
    const requestId = auditRequestId(c.req.header('x-request-id'));
    try {
      const result = await getRefundService().approveRefund(
        c.req.param('refundRequestId'),
        c.req.valid('json'),
      );
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'refund.approve', subjectRef: 'refund:redacted' }));
      return c.json(result);
    } catch (error) {
      const mapped = mapAdminError(error);
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'refund.approve', subjectRef: 'refund:redacted', error: operationalErrorForResponse('/api/admin/refunds/:refundRequestId/approve', mapped.status) }));
      return c.json(mapped.body, mapped.status);
    }
  })
  .post('/refunds/:refundRequestId/reject', zValidator('json', rejectRefundRequestSchema), async (c) => {
    const requestId = auditRequestId(c.req.header('x-request-id'));
    try {
      const result = await getRefundService().rejectRefund(
        c.req.param('refundRequestId'),
        c.req.valid('json'),
      );
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'refund.reject', subjectRef: 'refund:redacted' }));
      return c.json(result);
    } catch (error) {
      const mapped = mapAdminError(error);
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'refund.reject', subjectRef: 'refund:redacted', error: operationalErrorForResponse('/api/admin/refunds/:refundRequestId/reject', mapped.status) }));
      return c.json(mapped.body, mapped.status);
    }
  })
  .post('/refunds/:refundRequestId/request-provider-refund', zValidator('json', requestProviderRefundSchema), async (c) => {
    const requestId = auditRequestId(c.req.header('x-request-id'));
    try {
      const result = await getRefundService().requestProviderRefund(
        c.req.param('refundRequestId'),
        c.req.valid('json'),
      );
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'refund.provider.request', subjectRef: 'refund:redacted' }));
      return c.json(result);
    } catch (error) {
      const mapped = mapAdminError(error);
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'refund.provider.request', subjectRef: 'refund:redacted', error: operationalErrorForResponse('/api/admin/refunds/:refundRequestId/request-provider-refund', mapped.status) }));
      return c.json(mapped.body, mapped.status);
    }
  })
  .use('*', adminAuth)
  .get('/members', async (c) => c.json(await listAdminMembers()))
  .get('/members/:memberId', async (c) => {
    try { return c.json(await getAdminMember(c.req.param('memberId'))); } catch (error) { const mapped = mapAdminError(error); return c.json(mapped.body, mapped.status); }
  })
  .patch('/members/:memberId/status', zValidator('json', updateAdminMemberStatusRequestSchema), async (c) => {
    const requestId = auditRequestId(c.res.headers.get('x-request-id') ?? c.req.header('x-request-id'));
    try {
      const result = await updateAdminMemberStatus(c.req.param('memberId'), c.req.valid('json'));
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'member.status.update', subjectRef: 'member:redacted' }));
      return c.json(result);
    } catch (error) {
      const mapped = mapAdminError(error);
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'member.status.update', subjectRef: 'member:redacted', error: operationalErrorForResponse('/api/admin/members/:memberId/status', mapped.status) }));
      return c.json(mapped.body, mapped.status);
    }
  })
  .get('/tournament-applications', async (c) => c.json(await listAdminTournamentApplications()))
  .get('/tournament-applications/:applicationId', async (c) => {
    try { return c.json(await getAdminTournamentApplication(c.req.param('applicationId'))); } catch (error) { const mapped = mapAdminError(error); return c.json(mapped.body, mapped.status); }
  })
  .get('/payments', async (c) => c.json(await listAdminPaymentRecords()))
  .patch('/payments/:paymentRecordId/status', zValidator('json', updateAdminPaymentStatusRequestSchema), async (c) => {
    const requestId = auditRequestId(c.res.headers.get('x-request-id') ?? c.req.header('x-request-id'));
    try {
      const result = await updateAdminPaymentRecord(c.req.param('paymentRecordId'), c.req.valid('json'));
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'payment.status.update', subjectRef: 'payment:redacted' }));
      return c.json(result);
    } catch (error) {
      const mapped = mapAdminError(error);
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'payment.status.update', subjectRef: 'payment:redacted', error: operationalErrorForResponse('/api/admin/payments/:paymentRecordId/status', mapped.status) }));
      return c.json(mapped.body, mapped.status);
    }
  })
  .get('/refunds', async (c) => c.json(await listAdminRefundRecords()))
  .get('/support-inquiries', async (c) => c.json(await listAdminSupportInquiries()))
  .patch('/support-inquiries/:inquiryId/status', zValidator('json', updateAdminSupportInquiryStatusRequestSchema), async (c) => {
    const requestId = auditRequestId(c.res.headers.get('x-request-id') ?? c.req.header('x-request-id'));
    try {
      const result = await updateAdminSupportInquiryStatus(c.req.param('inquiryId'), c.req.valid('json'));
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'support.status.update', subjectRef: 'support:redacted' }));
      return c.json(result);
    } catch (error) {
      const mapped = mapAdminError(error);
      writeStructuredEvent(createAdminAuditEvent({ requestId, action: 'support.status.update', subjectRef: 'support:redacted', error: operationalErrorForResponse('/api/admin/support-inquiries/:inquiryId/status', mapped.status) }));
      return c.json(mapped.body, mapped.status);
    }
  });
