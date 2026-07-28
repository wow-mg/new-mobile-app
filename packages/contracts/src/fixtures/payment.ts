import {
  createPaymentOrderRequestSchema,
  paymentApiErrorResponseSchema,
  paymentOrderResponseSchema,
} from '../index.js';

export const sandboxCreatePaymentOrderFixture = createPaymentOrderRequestSchema.parse({
  applicationId: 'application-fixture',
  paymentMode: 'simplePay',
  amount: 60000,
  currency: 'KRW',
  idempotencyKey: 'fixture-payment-order',
});

export const sandboxPendingPaymentFixture = paymentOrderResponseSchema.parse({
  paymentRecordId: 'payment-fixture',
  applicationId: 'application-fixture',
  paymentMode: 'simplePay',
  status: 'pendingProvider',
  providerPaymentId: 'provider-payment-reference',
  providerOrderId: 'provider-order-reference',
  providerStatus: 'pending',
  amount: 60000,
  currency: 'KRW',
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
});

export const sandboxPaidPaymentFixture = paymentOrderResponseSchema.parse({
  ...sandboxPendingPaymentFixture,
  status: 'paid',
  providerStatus: 'paid',
  reconciledAt: '2026-07-27T00:05:00.000Z',
});

export const sandboxFailedPaymentFixture = paymentOrderResponseSchema.parse({
  ...sandboxPendingPaymentFixture,
  status: 'failed',
  providerStatus: 'failed',
  reconciledAt: '2026-07-27T00:05:00.000Z',
});

export const sandboxPaymentErrorFixture = paymentApiErrorResponseSchema.parse({
  error: 'PAYMENT_PROVIDER_UNAVAILABLE',
});
