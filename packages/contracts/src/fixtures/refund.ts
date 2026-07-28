import { refundRequestSchema } from '../index.js';

export const sandboxRefundRequestFixture = refundRequestSchema.parse({
  refundRequestId: 'refund-fixture-1',
  paymentRecordId: 'payment-fixture-1',
  applicationId: 'application-fixture-1',
  status: 'operatorReview',
  policyDecision: 'fullRefund',
  applicationStatus: 'cancellationRequested',
  paymentStatus: 'refundRequested',
  paidAmountKrw: 60000,
  requestedAmountKrw: 60000,
  currency: 'KRW',
  reason: 'Schedule conflict',
  requestedAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
  history: [{
    refundHistoryId: 'refund-history-fixture-1',
    event: 'requested',
    actorKind: 'customer',
    refundStatus: 'operatorReview',
    applicationStatus: 'cancellationRequested',
    paymentStatus: 'refundRequested',
    amountKrw: 60000,
    currency: 'KRW',
    message: 'Refund request received for operator review.',
    createdAt: '2026-08-01T12:00:00.000Z',
  }],
});
