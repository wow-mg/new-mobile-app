import { Hono } from 'hono';
import {
  paymentProviderWebhookErrorResponseSchema,
  paymentProviderWebhookEventSchema,
  type PaymentProviderWebhookErrorCode,
} from '@template/contracts';
import {
  createRuntimePaymentWebhookVerifier,
  getPaymentWebhookService,
  PaymentWebhookServiceError,
  type PaymentWebhookVerifier,
} from '../services/payment-webhook.service.js';

type WebhookService = {
  processVerifiedEvent(event: unknown): Promise<unknown>;
};

function errorResponse(code: PaymentProviderWebhookErrorCode) {
  return paymentProviderWebhookErrorResponseSchema.parse({ error: code });
}

export function createPaymentProviderWebhookRoute(dependencies?: {
  verifier: PaymentWebhookVerifier;
  service: WebhookService;
}) {
  const verifier = dependencies?.verifier ?? createRuntimePaymentWebhookVerifier();
  const service = dependencies?.service ?? getPaymentWebhookService();

  return new Hono().post('/webhook', async (c) => {
    const signature = c.req.header('x-payment-provider-signature');
    if (!signature) {
      return c.json(errorResponse('PAYMENT_WEBHOOK_SIGNATURE_REQUIRED'), 401);
    }

    const rawBody = new Uint8Array(await c.req.arrayBuffer());
    if (!verifier.verify({ rawBody, signature })) {
      return c.json(errorResponse('PAYMENT_WEBHOOK_SIGNATURE_INVALID'), 401);
    }

    let event: unknown;
    try {
      event = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return c.json(errorResponse('PAYMENT_WEBHOOK_EVENT_INVALID'), 400);
    }
    const parsed = paymentProviderWebhookEventSchema.safeParse(event);
    if (!parsed.success) {
      return c.json(errorResponse('PAYMENT_WEBHOOK_EVENT_INVALID'), 400);
    }

    try {
      return c.json(await service.processVerifiedEvent(parsed.data), 200);
    } catch (error) {
      const candidate = error as { code?: PaymentProviderWebhookErrorCode; status?: number };
      if (error instanceof PaymentWebhookServiceError || (candidate.code && candidate.status)) {
        const status = candidate.status === 503 ? 503 : candidate.status === 400 ? 400 : 409;
        return c.json(errorResponse(candidate.code!), status);
      }
      return c.json(errorResponse('PAYMENT_WEBHOOK_PERSISTENCE_FAILED'), 503);
    }
  });
}

export const paymentProviderWebhookRoute = createPaymentProviderWebhookRoute();
