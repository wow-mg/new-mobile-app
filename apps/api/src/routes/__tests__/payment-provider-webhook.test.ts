import { Hono } from 'hono';
import {
  paymentProviderWebhookErrorResponseSchema,
  paymentProviderWebhookResponseSchema,
} from '@template/contracts';
import { createPaymentProviderWebhookRoute } from '../payment-provider-webhook.js';
import {
  createFixturePaymentWebhookSignature,
  createFixturePaymentWebhookVerifier,
} from '../../services/payment-webhook.service.js';

const event = {
  provider: 'kg_inicis',
  providerEventId: 'event-route-paid-001',
  providerPaymentId: 'provider-payment-route-001',
  providerOrderId: 'provider-order-route-001',
  applicationId: 'application-route-001',
  amount: 60000,
  currency: 'KRW',
  providerStatus: 'paid',
  occurredAt: '2026-07-28T00:01:00.000Z',
};

function subject() {
  const processVerifiedEvent = vi.fn(async () => ({
    accepted: true as const,
    result: 'processed' as const,
    paymentRecordId: 'payment-route-001',
    status: 'paid' as const,
  }));
  const verify = vi.fn(({ signature }) => signature === 'fixture-valid-signature');
  const route = createPaymentProviderWebhookRoute({
    verifier: {
      verify,
    },
    service: { processVerifiedEvent },
  });
  return {
    app: new Hono().route('/api/payments/providers/kg-inicis', route),
    processVerifiedEvent,
    verify,
  };
}

describe('POST provider webhook', () => {
  it('accepts a valid fixture signature without participant bearer auth', async () => {
    const { app, processVerifiedEvent, verify } = subject();
    const rawBody = JSON.stringify(event);
    const response = await app.request('/api/payments/providers/kg-inicis/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-payment-provider-signature': 'fixture-valid-signature',
      },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    expect(paymentProviderWebhookResponseSchema.parse(await response.json()).result).toBe('processed');
    expect(verify).toHaveBeenCalledWith({
      rawBody: new TextEncoder().encode(rawBody),
      signature: 'fixture-valid-signature',
    });
    expect(processVerifiedEvent).toHaveBeenCalledWith(event);
    expect(processVerifiedEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    [undefined, 'PAYMENT_WEBHOOK_SIGNATURE_REQUIRED'],
    ['fixture-invalid-signature', 'PAYMENT_WEBHOOK_SIGNATURE_INVALID'],
  ])('fails closed for missing or invalid signature without persisting unverified fields', async (signature, code) => {
    const { app, processVerifiedEvent } = subject();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (signature) headers['x-payment-provider-signature'] = signature;

    const response = await app.request('/api/payments/providers/kg-inicis/webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    });

    expect(response.status).toBe(401);
    expect(paymentProviderWebhookErrorResponseSchema.parse(await response.json())).toEqual({ error: code });
    expect(processVerifiedEvent).not.toHaveBeenCalled();
  });

  it('returns a contract error for malformed signed payloads', async () => {
    const { app } = subject();
    const response = await app.request('/api/payments/providers/kg-inicis/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-payment-provider-signature': 'fixture-valid-signature',
      },
      body: JSON.stringify({ ...event, amount: '60000' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'PAYMENT_WEBHOOK_EVENT_INVALID' });
  });

  it('maps persistence failure to a retry-safe 503 response', async () => {
    const route = createPaymentProviderWebhookRoute({
      verifier: { verify: () => true },
      service: {
        processVerifiedEvent: vi.fn(async () => {
          throw Object.assign(new Error('redacted'), {
            code: 'PAYMENT_WEBHOOK_PERSISTENCE_FAILED',
            status: 503,
          });
        }),
      },
    });
    const app = new Hono().route('/api/payments/providers/kg-inicis', route);
    const response = await app.request('/api/payments/providers/kg-inicis/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-payment-provider-signature': 'fixture-valid-signature',
      },
      body: JSON.stringify(event),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'PAYMENT_WEBHOOK_PERSISTENCE_FAILED' });
  });

  it('rejects a payload changed after its fixture signature was created', async () => {
    const processVerifiedEvent = vi.fn();
    const route = createPaymentProviderWebhookRoute({
      verifier: createFixturePaymentWebhookVerifier(),
      service: { processVerifiedEvent },
    });
    const app = new Hono().route('/api/payments/providers/kg-inicis', route);
    const signedBody = JSON.stringify(event);
    const signature = createFixturePaymentWebhookSignature(new TextEncoder().encode(signedBody));
    const tamperedBody = signedBody.replace('"amount":60000', '"amount":50000');

    const response = await app.request('/api/payments/providers/kg-inicis/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-payment-provider-signature': signature,
      },
      body: tamperedBody,
    });

    expect(response.status).toBe(401);
    expect(processVerifiedEvent).not.toHaveBeenCalled();
  });
});
