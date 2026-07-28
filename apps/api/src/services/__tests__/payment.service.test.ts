import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPaymentService,
  PaymentServiceError,
  type PaymentApplication,
  type PaymentRecordStore,
} from '../payment.service.js';
import type { PaymentProviderClient } from '../payment-provider.client.js';
import type { PaymentProviderStatus } from '@template/contracts';

const application: PaymentApplication = {
  applicationId: 'application-1',
  participantId: 'participant-1',
  amount: 60000,
  currency: 'KRW',
};

function memoryStore(): PaymentRecordStore {
  const records = new Map();
  return {
    findByIdempotencyKey: vi.fn(async (key) => [...records.values()].find((record) => record.idempotencyKey === key)),
    findByPaymentRecordId: vi.fn(async (id) => records.get(id)),
    insert: vi.fn(async (record) => {
      records.set(record.paymentRecordId, record);
      return record;
    }),
    update: vi.fn(async (record) => {
      records.set(record.paymentRecordId, record);
      return record;
    }),
  };
}

function provider(status: PaymentProviderStatus = 'pending'): PaymentProviderClient {
  return {
    createOrder: vi.fn(async () => ({
      providerPaymentId: 'provider-payment-reference',
      providerOrderId: 'provider-order-reference',
      providerStatus: status,
      auditMetadata: { requestAccepted: true },
      rawResponseMetadata: { responseCode: 'accepted' },
    })),
    getPaymentStatus: vi.fn(async () => ({
      providerPaymentId: 'provider-payment-reference',
      providerOrderId: 'provider-order-reference',
      providerStatus: status,
      auditMetadata: { reconciled: true },
      rawResponseMetadata: { responseCode: status },
    })),
  };
}

function service(options = {}) {
  const store = memoryStore();
  const providerClient = provider();
  return {
    store,
    providerClient,
    paymentService: createPaymentService({
      store,
      providerClient,
      findApplication: vi.fn(async (id) => id === application.applicationId ? application : undefined),
      now: () => new Date('2026-07-27T00:00:00.000Z'),
      createId: () => 'payment-record-1',
      ...options,
    }),
  };
}

describe('payment service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an order once and replays an identical idempotent request', async () => {
    const { paymentService, providerClient } = service();
    const input = {
      applicationId: application.applicationId,
      paymentMode: 'card' as const,
      amount: 60000,
      currency: 'KRW' as const,
      idempotencyKey: 'payment-order-application-1',
    };

    const first = await paymentService.createOrder('participant-1', input);
    const replay = await paymentService.createOrder('participant-1', input);

    expect(first.status).toBe('pendingProvider');
    expect(replay).toEqual(first);
    expect(providerClient.createOrder).toHaveBeenCalledTimes(1);
  });

  it('rejects conflicting idempotency, amount, missing application, and ownership', async () => {
    const { paymentService } = service();
    const base = {
      applicationId: application.applicationId,
      paymentMode: 'card' as const,
      amount: 60000,
      currency: 'KRW' as const,
      idempotencyKey: 'payment-order-application-1',
    };
    await paymentService.createOrder('participant-1', base);

    await expect(paymentService.createOrder('participant-1', { ...base, paymentMode: 'simplePay' }))
      .rejects.toMatchObject({ code: 'PAYMENT_IDEMPOTENCY_CONFLICT', status: 409 });
    await expect(paymentService.createOrder('participant-1', { ...base, idempotencyKey: 'another-key', amount: 50000 }))
      .rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH', status: 400 });
    await expect(paymentService.createOrder('participant-1', { ...base, idempotencyKey: 'another-key', applicationId: 'missing' }))
      .rejects.toMatchObject({ code: 'PAYMENT_APPLICATION_NOT_FOUND', status: 404 });
    await expect(paymentService.createOrder('participant-2', { ...base, idempotencyKey: 'another-key' }))
      .rejects.toMatchObject({ code: 'PAYMENT_APPLICATION_OWNERSHIP_MISMATCH', status: 403 });
  });

  it('allows only safe provider-driven transitions and idempotent same-state reconcile', async () => {
    const providerClient = provider('paid');
    const { paymentService } = service({ providerClient });
    const created = await paymentService.createOrder('participant-1', {
      applicationId: application.applicationId,
      paymentMode: 'simplePay',
      amount: 60000,
      currency: 'KRW',
      idempotencyKey: 'payment-order-application-1',
    });

    const paid = await paymentService.reconcile('participant-1', created.paymentRecordId, {
      applicationId: application.applicationId,
      amount: 60000,
      currency: 'KRW',
    });
    expect(paid.status).toBe('paid');

    const sameState = await paymentService.reconcile('participant-1', created.paymentRecordId, {
      applicationId: application.applicationId,
      amount: 60000,
      currency: 'KRW',
    });
    expect(sameState.status).toBe('paid');

    providerClient.getPaymentStatus = vi.fn(async () => ({
      providerPaymentId: 'provider-payment-reference',
      providerOrderId: 'provider-order-reference',
      providerStatus: 'cancelled' as const,
      auditMetadata: {},
      rawResponseMetadata: {},
    }));
    await expect(paymentService.reconcile('participant-1', created.paymentRecordId, {
      applicationId: application.applicationId,
      amount: 60000,
      currency: 'KRW',
    })).rejects.toBeInstanceOf(PaymentServiceError);

    providerClient.getPaymentStatus = vi.fn(async () => ({
      providerPaymentId: 'provider-payment-reference',
      providerOrderId: 'provider-order-reference',
      providerStatus: 'refunded' as const,
      auditMetadata: {},
      rawResponseMetadata: {},
    }));
    await expect(paymentService.reconcile('participant-1', created.paymentRecordId, {
      applicationId: application.applicationId,
      amount: 60000,
      currency: 'KRW',
    })).resolves.toMatchObject({ status: 'refunded' });
  });
});
