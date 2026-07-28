import { beforeEach, describe, expect, it } from 'vitest';
import {
  adminPaymentRecordListResponseSchema,
  adminRefundRequestResponseSchema,
  adminApiErrorResponseSchema,
  paymentApiErrorResponseSchema,
  refundHistoryResponseSchema,
  refundRequestSchema,
} from '@template/contracts';
import { app } from '../../app.js';
import { resetRefundState } from '../../services/refund.service.js';
import { issueParticipantDevSession, resetParticipantDevSessions } from '../../services/participant-session.service.js';

let participantHeaders: Record<string, string>;
const operatorHeaders = {
  authorization: 'Bearer operator-test',
  'content-type': 'application/json',
};

async function readAdminRefund(paymentRecordId: string) {
  const response = await app.request('/api/admin/refunds', {
    headers: operatorHeaders,
  });
  expect(response.status).toBe(200);
  const matches = adminPaymentRecordListResponseSchema.parse(await response.json())
    .paymentRecords.filter((payment) => payment.paymentRecordId === paymentRecordId);
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('mocked refund/cancel/admin routes', () => {
  beforeEach(async () => {
    await resetRefundState();
    resetParticipantDevSessions();
    const session = issueParticipantDevSession({
      memberId: 'member-refund-test',
      kakaoUserId: 'kakao-refund-test',
      providerAccessToken: 'provider-test-fixture',
    });
    participantHeaders = { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json' };
  });

  it('returns contract-owned 403 envelopes for missing and unknown refund credentials', async () => {
    for (const authorization of [undefined, 'Bearer unknown-refund-token']) {
      const participant = await app.request('/api/payments/payment-refund-sandbox-1/refunds', {
        headers: authorization ? { authorization } : {},
      });
      expect(participant.status).toBe(403);
      expect(paymentApiErrorResponseSchema.parse(await participant.json())).toEqual({
        error: 'PAYMENT_FORBIDDEN',
      });

      const admin = await app.request('/api/admin/refunds/refund-missing/approve', {
        method: 'POST',
        headers: {
          ...(authorization ? { authorization } : {}),
          'content-type': 'application/json',
        },
        body: '{}',
      });
      expect(admin.status).toBe(403);
      expect(adminApiErrorResponseSchema.parse(await admin.json())).toEqual({
        error: 'ADMIN_API_FORBIDDEN',
      });
    }
  });

  it('does not authorize operator credentials on general participant API routes', async () => {
    const response = await app.request('/api/tournaments', {
      headers: { authorization: 'Bearer operator-test' },
    });
    expect(response.status).toBe(401);
  });

  it('creates a customer request and exposes read-only synchronized history', async () => {
    const create = await app.request('/api/payments/payment-refund-sandbox-1/refunds', {
      method: 'POST',
      headers: participantHeaders,
      body: JSON.stringify({ reason: 'Schedule conflict' }),
    });
    expect(create.status).toBe(201);
    const requested = refundRequestSchema.parse(await create.json());
    expect(requested).toMatchObject({
      status: 'operatorReview',
      applicationStatus: 'cancellationRequested',
      paymentStatus: 'refundRequested',
      policyDecision: 'fullRefund',
    });

    const history = await app.request('/api/payments/payment-refund-sandbox-1/refunds', {
      headers: participantHeaders,
    });
    expect(history.status).toBe(200);
    expect(refundHistoryResponseSchema.parse(await history.json()).refundRequest.history)
      .toHaveLength(1);
    expect(await readAdminRefund(requested.paymentRecordId)).toMatchObject({
      refundReviewStatus: 'operatorReview',
    });
  });

  it('lets only an operator approve and invoke the deterministic mock provider', async () => {
    const create = await app.request('/api/payments/payment-refund-sandbox-1/refunds', {
      method: 'POST',
      headers: participantHeaders,
      body: JSON.stringify({ reason: 'Schedule conflict' }),
    });
    const requested = refundRequestSchema.parse(await create.json());

    const forbidden = await app.request(`/api/admin/refunds/${requested.refundRequestId}/approve`, {
      method: 'POST',
      headers: participantHeaders,
      body: '{}',
    });
    expect(forbidden.status).toBe(403);
    expect(adminApiErrorResponseSchema.parse(await forbidden.json())).toEqual({
      error: 'ADMIN_API_FORBIDDEN',
    });

    const approve = await app.request(`/api/admin/refunds/${requested.refundRequestId}/approve`, {
      method: 'POST',
      headers: operatorHeaders,
      body: '{}',
    });
    expect(approve.status).toBe(200);
    expect(adminRefundRequestResponseSchema.parse(await approve.json()).refundRequest)
      .toMatchObject({ status: 'approved', paymentStatus: 'refundApproved' });
    expect(await readAdminRefund(requested.paymentRecordId)).toMatchObject({
      refundReviewStatus: 'approvedOffline',
    });

    const provider = await app.request(`/api/admin/refunds/${requested.refundRequestId}/request-provider-refund`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({ idempotencyKey: 'route-refund-provider-1' }),
    });
    expect(provider.status).toBe(200);
    const completed = adminRefundRequestResponseSchema.parse(await provider.json());
    expect(completed.refundRequest).toMatchObject({
      status: 'refunded',
      applicationStatus: 'cancelled',
      paymentStatus: 'refunded',
    });
    expect(completed.latestTransaction).toMatchObject({
      providerKind: 'sandboxMock',
      status: 'mockSucceeded',
    });
    expect(await readAdminRefund(requested.paymentRecordId)).toMatchObject({
      refundReviewStatus: 'refunded',
    });
  });

  it('lets an operator reject and restores customer application/payment status', async () => {
    const create = await app.request('/api/payments/payment-refund-sandbox-1/refunds', {
      method: 'POST',
      headers: participantHeaders,
      body: JSON.stringify({ reason: 'Changed plans' }),
    });
    const requested = refundRequestSchema.parse(await create.json());

    const reject = await app.request(`/api/admin/refunds/${requested.refundRequestId}/reject`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({ reason: 'Outside policy window' }),
    });
    expect(reject.status).toBe(200);
    const rejected = adminRefundRequestResponseSchema.parse(await reject.json());
    expect(rejected.refundRequest).toMatchObject({
      status: 'rejected',
      applicationStatus: 'submitted',
      paymentStatus: 'paid',
    });
    expect(rejected.refundRequest.history.at(-1)?.event).toBe('rejected');
    expect(await readAdminRefund(requested.paymentRecordId)).toMatchObject({
      refundReviewStatus: 'rejectedOffline',
    });
  });

  it('maps a deterministic mock-provider failure to 503 after durable failure sync', async () => {
    await resetRefundState({ providerBehavior: 'failure' });
    const create = await app.request('/api/payments/payment-refund-sandbox-1/refunds', {
      method: 'POST',
      headers: participantHeaders,
      body: JSON.stringify({ reason: 'Schedule conflict' }),
    });
    const requested = refundRequestSchema.parse(await create.json());
    await app.request(`/api/admin/refunds/${requested.refundRequestId}/approve`, {
      method: 'POST',
      headers: operatorHeaders,
      body: '{}',
    });
    const provider = await app.request(`/api/admin/refunds/${requested.refundRequestId}/request-provider-refund`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({ idempotencyKey: 'route-refund-provider-failure' }),
    });
    expect(provider.status).toBe(503);
    expect(adminApiErrorResponseSchema.parse(await provider.json())).toEqual({
      error: 'ADMIN_REFUND_PROVIDER_UNAVAILABLE',
    });

    const history = await app.request('/api/payments/payment-refund-sandbox-1/refunds', {
      headers: participantHeaders,
    });
    expect(refundHistoryResponseSchema.parse(await history.json()).refundRequest)
      .toMatchObject({ status: 'providerFailed', paymentStatus: 'refundApproved' });
    expect(await readAdminRefund(requested.paymentRecordId)).toMatchObject({
      refundReviewStatus: 'providerFailed',
    });
  });

  it('fails closed for unknown records without exposing policy/provider internals', async () => {
    const response = await app.request('/api/payments/missing/refunds', {
      headers: participantHeaders,
    });
    expect(response.status).toBe(404);
    expect(paymentApiErrorResponseSchema.parse(await response.json())).toEqual({
      error: 'PAYMENT_RECORD_NOT_FOUND',
    });
  });
});
