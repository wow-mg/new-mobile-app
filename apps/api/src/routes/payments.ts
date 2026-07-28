import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createPaymentOrderRequestSchema,
  paymentApiErrorResponseSchema,
  reconcilePaymentRequestSchema,
  createRefundRequestSchema,
} from '@template/contracts';
import { getPaymentService, PaymentServiceError } from '../services/payment.service.js';
import { getRefundService, RefundServiceError } from '../services/refund.service.js';
import { consumeParticipantDevSession } from '../services/participant-session.service.js';

function paymentError(error: unknown) {
  if (error instanceof PaymentServiceError) {
    return {
      body: paymentApiErrorResponseSchema.parse({ error: error.code }),
      status: error.status,
    };
  }
  if (error instanceof RefundServiceError) {
    return {
      body: paymentApiErrorResponseSchema.parse({ error: error.code }),
      status: error.status,
    };
  }
  throw error;
}

export const paymentsRoute = new Hono<{ Variables: { participantId: string } }>()
  .use('*', async (c, next) => {
    const auth = consumeParticipantDevSession(c.req.header('authorization'));
    if (!auth) {
      return c.json(paymentApiErrorResponseSchema.parse({ error: 'PAYMENT_FORBIDDEN' }), 403);
    }
    c.set('participantId', auth.session.participantId);
    await next();
  })
  .post('/orders', zValidator('json', createPaymentOrderRequestSchema), async (c) => {
    try {
      const result = await getPaymentService().createOrderWithResult(
        c.get('participantId'),
        c.req.valid('json'),
      );
      return c.json(result.payment, result.replayed ? 200 : 201);
    } catch (error) {
      const mapped = paymentError(error);
      return c.json(mapped.body, mapped.status);
    }
  })
  .post('/:paymentRecordId/refunds', zValidator('json', createRefundRequestSchema), async (c) => {
    try {
      return c.json(await getRefundService().requestRefund(
        c.get('participantId'),
        c.req.param('paymentRecordId'),
        c.req.valid('json'),
      ), 201);
    } catch (error) {
      const mapped = paymentError(error);
      return c.json(mapped.body, mapped.status);
    }
  })
  .get('/:paymentRecordId/refunds', async (c) => {
    try {
      return c.json(await getRefundService().readRefundHistory(
        c.get('participantId'),
        c.req.param('paymentRecordId'),
      ));
    } catch (error) {
      const mapped = paymentError(error);
      return c.json(mapped.body, mapped.status);
    }
  })
  .get('/:paymentRecordId', async (c) => {
    try {
      return c.json(await getPaymentService().readStatus(
        c.get('participantId'),
        c.req.param('paymentRecordId'),
      ));
    } catch (error) {
      const mapped = paymentError(error);
      return c.json(mapped.body, mapped.status);
    }
  })
  .post('/:paymentRecordId/reconcile', zValidator('json', reconcilePaymentRequestSchema), async (c) => {
    try {
      return c.json(await getPaymentService().reconcile(
        c.get('participantId'),
        c.req.param('paymentRecordId'),
        c.req.valid('json'),
      ));
    } catch (error) {
      const mapped = paymentError(error);
      return c.json(mapped.body, mapped.status);
    }
  });
