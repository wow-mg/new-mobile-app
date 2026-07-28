import { paymentProviderWebhookEventSchema } from '../index.js';

export const sandboxWebhookSignaturePlaceholder = 'fixture-valid-signature';

export const sandboxPaidWebhookFixture = paymentProviderWebhookEventSchema.parse({
  provider: 'kg_inicis',
  providerEventId: 'fixture-event-paid',
  providerPaymentId: 'provider-payment-reference',
  providerOrderId: 'provider-order-reference',
  applicationId: 'application-fixture',
  amount: 60000,
  currency: 'KRW',
  providerStatus: 'paid',
  occurredAt: '2026-07-28T00:01:00.000Z',
});

export const sandboxFailedWebhookFixture = paymentProviderWebhookEventSchema.parse({
  ...sandboxPaidWebhookFixture,
  providerEventId: 'fixture-event-failed',
  providerStatus: 'failed',
});
