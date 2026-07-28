import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminRefundRequestResponseSchema,
  approveRefundRequestSchema,
  createRefundRequestSchema,
  paymentApiErrorResponseSchema,
  refundHistoryResponseSchema,
  refundPolicyDecisionSchema,
  refundRequestSchema,
  rejectRefundRequestSchema,
  requestProviderRefundSchema,
  tournamentApplicationStatusSchema,
} from '../dist/index.js';
import { sandboxRefundRequestFixture } from '../dist/fixtures/refund.js';

test('refund contracts keep policy inputs server-owned and responses customer-safe', () => {
  assert.deepEqual(createRefundRequestSchema.parse({ reason: 'Schedule conflict' }), {
    reason: 'Schedule conflict',
  });
  assert.throws(() => createRefundRequestSchema.parse({
    reason: 'tamper',
    partialRefundPercent: 100,
  }));

  assert.equal(refundPolicyDecisionSchema.parse('fullRefund'), 'fullRefund');
  assert.equal(refundPolicyDecisionSchema.parse('partialRefund'), 'partialRefund');
  assert.equal(refundPolicyDecisionSchema.parse('noRefund'), 'noRefund');
  assert.equal(refundPolicyDecisionSchema.parse('operatorOverride'), 'operatorOverride');

  const parsed = refundRequestSchema.parse(sandboxRefundRequestFixture);
  assert.equal(parsed.currency, 'KRW');
  assert.equal(parsed.history[0].event, 'requested');
  assert.equal('operatorNote' in parsed, false);
  assert.equal('providerRawResponseMetadata' in parsed, false);
});

test('operator overrides are all-or-nothing and provider requests are idempotent', () => {
  assert.deepEqual(approveRefundRequestSchema.parse({}), {});
  assert.deepEqual(approveRefundRequestSchema.parse({
    override: {
      decision: 'operatorOverride',
      amountKrw: 30000,
      reason: 'Documented exception',
    },
  }), {
    override: {
      decision: 'operatorOverride',
      amountKrw: 30000,
      reason: 'Documented exception',
    },
  });
  assert.throws(() => approveRefundRequestSchema.parse({
    override: { decision: 'operatorOverride', amountKrw: 30000 },
  }));
  assert.deepEqual(rejectRefundRequestSchema.parse({ reason: 'Policy does not qualify' }), {
    reason: 'Policy does not qualify',
  });
  assert.deepEqual(requestProviderRefundSchema.parse({
    idempotencyKey: 'refund-provider-request-1',
  }), {
    idempotencyKey: 'refund-provider-request-1',
  });
});

test('refund statuses, history, and errors are shared contract-owned shapes', () => {
  assert.equal(tournamentApplicationStatusSchema.parse('cancellationRequested'), 'cancellationRequested');
  assert.equal(tournamentApplicationStatusSchema.parse('cancellationApproved'), 'cancellationApproved');
  assert.equal(tournamentApplicationStatusSchema.parse('cancelled'), 'cancelled');

  const history = refundHistoryResponseSchema.parse({
    refundRequest: sandboxRefundRequestFixture,
  });
  assert.equal(history.refundRequest.status, 'operatorReview');

  const admin = adminRefundRequestResponseSchema.parse({
    refundRequest: sandboxRefundRequestFixture,
  });
  assert.equal(admin.latestTransaction, undefined);

  for (const error of [
    'REFUND_POLICY_UNAVAILABLE',
    'REFUND_INVALID_TRANSITION',
    'REFUND_REQUEST_NOT_FOUND',
  ]) {
    assert.deepEqual(paymentApiErrorResponseSchema.parse({ error }), { error });
  }
});
