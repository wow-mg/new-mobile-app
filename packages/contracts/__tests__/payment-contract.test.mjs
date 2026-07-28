import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPaymentOrderRequestSchema,
  paymentApiErrorResponseSchema,
  paymentModeSchema,
  paymentOrderResponseSchema,
  paymentProviderStatusSchema,
  paymentStatusSchema,
  reconcilePaymentRequestSchema,
} from '../dist/index.js';

test('payment contracts preserve offline literals and add card/simple-pay provider states', () => {
  for (const value of ['operatorManagedOffline', 'card', 'simplePay']) {
    assert.equal(paymentModeSchema.parse(value), value);
  }
  for (const value of [
    'notStartedSandbox',
    'operatorReview',
    'confirmedOffline',
    'orderCreated',
    'pendingProvider',
    'paid',
    'failed',
    'cancelled',
    'refunded',
  ]) {
    assert.equal(paymentStatusSchema.parse(value), value);
  }
  for (const value of ['created', 'pending', 'paid', 'failed', 'cancelled', 'refunded']) {
    assert.equal(paymentProviderStatusSchema.parse(value), value);
  }
});

test('create and reconcile requests require VAT-inclusive KRW amounts and bounded idempotency', () => {
  assert.deepEqual(createPaymentOrderRequestSchema.parse({
    applicationId: 'application-1',
    paymentMode: 'simplePay',
    amount: 60000,
    currency: 'KRW',
    idempotencyKey: 'payment-order-application-1',
  }), {
    applicationId: 'application-1',
    paymentMode: 'simplePay',
    amount: 60000,
    currency: 'KRW',
    idempotencyKey: 'payment-order-application-1',
  });
  assert.throws(() => createPaymentOrderRequestSchema.parse({
    applicationId: 'application-1',
    paymentMode: 'operatorManagedOffline',
    amount: 60000,
    currency: 'KRW',
    idempotencyKey: 'payment-order-application-1',
  }));
  assert.throws(() => createPaymentOrderRequestSchema.parse({
    applicationId: 'application-1',
    paymentMode: 'card',
    amount: 60000.5,
    currency: 'KRW',
    idempotencyKey: 'payment-order-application-1',
  }));
  assert.deepEqual(reconcilePaymentRequestSchema.parse({
    applicationId: 'application-1',
    amount: 60000,
    currency: 'KRW',
  }), {
    applicationId: 'application-1',
    amount: 60000,
    currency: 'KRW',
  });
});

test('public payment responses expose safe provider references without raw metadata', () => {
  const parsed = paymentOrderResponseSchema.parse({
    paymentRecordId: 'payment-record-1',
    applicationId: 'application-1',
    paymentMode: 'card',
    status: 'pendingProvider',
    providerPaymentId: 'provider-payment-reference',
    providerOrderId: 'provider-order-reference',
    providerStatus: 'pending',
    amount: 60000,
    currency: 'KRW',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  });
  assert.equal(parsed.amount, 60000);
  assert.equal('providerRawResponse' in parsed, false);
});

test('payment API errors are contract-owned', () => {
  for (const error of [
    'PAYMENT_APPLICATION_NOT_FOUND',
    'PAYMENT_APPLICATION_OWNERSHIP_MISMATCH',
    'PAYMENT_AMOUNT_MISMATCH',
    'PAYMENT_IDEMPOTENCY_CONFLICT',
    'PAYMENT_INVALID_TRANSITION',
    'PAYMENT_PROVIDER_UNAVAILABLE',
    'PAYMENT_SANDBOX_ONLY',
  ]) {
    assert.deepEqual(paymentApiErrorResponseSchema.parse({ error }), { error });
  }
});
