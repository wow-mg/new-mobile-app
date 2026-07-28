import assert from 'node:assert/strict';
import test from 'node:test';
import {
  paymentProviderWebhookErrorResponseSchema,
  paymentProviderWebhookEventSchema,
  paymentProviderWebhookResponseSchema,
} from '../dist/index.js';
import {
  sandboxFailedWebhookFixture,
  sandboxPaidWebhookFixture,
  sandboxWebhookSignaturePlaceholder,
} from '../dist/fixtures/payment-provider-webhook.js';

test('provider webhook fixtures expose contract-safe sandbox events and a placeholder signature', () => {
  assert.equal(sandboxWebhookSignaturePlaceholder, 'fixture-valid-signature');
  assert.equal(paymentProviderWebhookEventSchema.parse(sandboxPaidWebhookFixture).providerStatus, 'paid');
  assert.equal(paymentProviderWebhookEventSchema.parse(sandboxFailedWebhookFixture).providerStatus, 'failed');
  assert.equal(JSON.stringify(sandboxPaidWebhookFixture).includes('secret'), false);
});

test('webhook acknowledgement and error contracts reject secret or raw payload fields', () => {
  assert.deepEqual(paymentProviderWebhookResponseSchema.parse({
    accepted: true,
    result: 'duplicate',
    paymentRecordId: 'payment-fixture',
    status: 'paid',
  }), {
    accepted: true,
    result: 'duplicate',
    paymentRecordId: 'payment-fixture',
    status: 'paid',
  });
  assert.throws(() => paymentProviderWebhookResponseSchema.parse({
    accepted: true,
    result: 'processed',
    paymentRecordId: 'payment-fixture',
    status: 'paid',
    signature: 'must-not-leak',
  }));
  assert.deepEqual(paymentProviderWebhookErrorResponseSchema.parse({
    error: 'PAYMENT_WEBHOOK_SIGNATURE_INVALID',
  }), {
    error: 'PAYMENT_WEBHOOK_SIGNATURE_INVALID',
  });
});

test('provider webhook event is strict, KRW-only, and requires matching references', () => {
  assert.throws(() => paymentProviderWebhookEventSchema.parse({
    ...sandboxPaidWebhookFixture,
    currency: 'USD',
  }));
  assert.throws(() => paymentProviderWebhookEventSchema.parse({
    ...sandboxPaidWebhookFixture,
    rawPayload: { credential: 'forbidden' },
  }));
});
