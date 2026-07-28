import {
  createDatabasePaymentWebhookStore,
  createMemoryPaymentWebhookStore,
  createPaymentWebhookService,
  PaymentWebhookServiceError,
} from '../payment-webhook.service.js';

const payment = {
  paymentRecordId: 'payment-001',
  applicationId: 'application-001',
  participantId: 'participant-001',
  paymentMode: 'card' as const,
  status: 'pendingProvider' as const,
  providerPaymentId: 'provider-payment-001',
  providerOrderId: 'provider-order-001',
  providerStatus: 'pending' as const,
  amount: 60000,
  currency: 'KRW' as const,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

const paidEvent = {
  provider: 'kg_inicis' as const,
  providerEventId: 'event-paid-001',
  providerPaymentId: payment.providerPaymentId,
  providerOrderId: payment.providerOrderId,
  applicationId: payment.applicationId,
  amount: payment.amount,
  currency: payment.currency,
  providerStatus: 'paid' as const,
  occurredAt: '2026-07-28T00:01:00.000Z',
};

function createSubject(options?: {
  applicationAmount?: number;
  triggerNotification?: (handoff: Record<string, unknown>) => Promise<void>;
}) {
  const store = createMemoryPaymentWebhookStore({
    payments: [payment],
    applications: [{
      applicationId: payment.applicationId,
      participantId: payment.participantId,
      amount: options?.applicationAmount ?? payment.amount,
      currency: payment.currency,
    }],
  });
  const notifications: Array<Record<string, unknown>> = [];
  const service = createPaymentWebhookService({
    store,
    now: () => new Date('2026-07-28T00:02:00.000Z'),
    createAuditId: () => 'payment-event-audit-001',
    triggerNotification: options?.triggerNotification ?? (async (handoff) => {
      notifications.push(handoff);
    }),
  });
  return { store, service, notifications };
}

describe('payment provider webhook reconciliation', () => {
  it('executes the database-shaped reconciliation inside one transaction with row lock, audit, and handoff', async () => {
    const queryResults = [
      [],
      [{
        paymentRecordId: payment.paymentRecordId,
        applicationId: payment.applicationId,
        participantId: payment.participantId,
        status: payment.status,
        providerPaymentId: payment.providerPaymentId,
        providerOrderId: payment.providerOrderId,
        amount: payment.amount,
        amountKrw: payment.amount,
        currency: payment.currency,
      }],
      [{
        applicationId: payment.applicationId,
        participantId: payment.participantId,
        entryFeeKrw: payment.amount,
      }],
      [],
    ];
    let selectIndex = 0;
    let transactionCalls = 0;
    let rowLocks = 0;
    const insertedValues: unknown[] = [];
    const tx = {
      select: () => {
        const result = queryResults[selectIndex++];
        const builder = {
          from: () => builder,
          leftJoin: () => builder,
          where: () => builder,
          orderBy: () => builder,
          for: () => {
            rowLocks += 1;
            return builder;
          },
          limit: async () => result,
        };
        return builder;
      },
      insert: () => ({
        values: async (values: unknown) => {
          insertedValues.push(values);
        },
      }),
      update: () => ({
        set: () => ({
          where: async () => {},
        }),
      }),
    };
    const database = {
      transaction: async (callback: (value: typeof tx) => Promise<unknown>) => {
        transactionCalls += 1;
        return callback(tx);
      },
    };
    const store = createDatabasePaymentWebhookStore(database as never);

    const result = await store.processVerifiedEvent({
      event: paidEvent,
      eventHash: 'fixture-event-hash',
      eventHashVersion: 'v1',
      auditId: 'payment-event-audit-db',
      receivedAt: '2026-07-28T00:02:00.000Z',
    });

    expect(result).toMatchObject({ kind: 'accepted', response: { result: 'processed' } });
    expect(transactionCalls).toBe(1);
    expect(rowLocks).toBe(1);
    expect(insertedValues).toHaveLength(2);
  });

  it('recovers database unique conflicts as duplicate or the original rejection', async () => {
    function conflictDatabase(results: unknown[][]) {
      let index = 0;
      return {
        transaction: async () => {
          throw Object.assign(new Error('fixture unique conflict'), { code: '23505' });
        },
        select: () => {
          const result = results[index++];
          const builder = {
            from: () => builder,
            where: () => builder,
            limit: async () => result,
          };
          return builder;
        },
      };
    }
    const input = {
      event: paidEvent,
      eventHash: 'fixture-event-hash',
      eventHashVersion: 'v1' as const,
      auditId: 'payment-event-audit-db-conflict',
      receivedAt: '2026-07-28T00:02:00.000Z',
    };
    const committedAudit = {
      paymentRecordId: payment.paymentRecordId,
      processingResult: 'processed',
      rejectionCode: null,
    };
    const acceptedStore = createDatabasePaymentWebhookStore(conflictDatabase([
      [committedAudit],
      [{
        ...payment,
        amountKrw: payment.amount,
      }],
    ]) as never);
    await expect(acceptedStore.processVerifiedEvent(input)).resolves.toMatchObject({
      kind: 'accepted',
      response: { result: 'duplicate', status: 'pendingProvider' },
    });

    const rejectedStore = createDatabasePaymentWebhookStore(conflictDatabase([[
      {
        paymentRecordId: null,
        processingResult: 'rejected',
        rejectionCode: 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND',
      },
    ]]) as never);
    await expect(rejectedStore.processVerifiedEvent(input)).resolves.toEqual({
      kind: 'rejected',
      code: 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND',
    });
  });

  it('deduplicates duplicate provider event ids and triggers one notification', async () => {
    const { store, service, notifications } = createSubject();

    const first = await service.processVerifiedEvent(paidEvent);
    const duplicate = await service.processVerifiedEvent(paidEvent);

    expect(first.result).toBe('processed');
    expect(duplicate.result).toBe('duplicate');
    expect(store.listAuditEvents()).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });

  it('deduplicates an event without provider id by its deterministic v1 hash', async () => {
    const { store, service } = createSubject();
    const { providerEventId: _providerEventId, ...eventWithoutId } = paidEvent;

    expect((await service.processVerifiedEvent(eventWithoutId)).result).toBe('processed');
    expect((await service.processVerifiedEvent(eventWithoutId)).result).toBe('duplicate');
    expect(store.listAuditEvents()).toHaveLength(1);
    expect(store.listAuditEvents()[0].eventHashVersion).toBe('v1');
  });

  it('atomically resolves concurrent duplicates with one audit winner and notification', async () => {
    const { store, service, notifications } = createSubject();

    const results = await Promise.all([
      service.processVerifiedEvent(paidEvent),
      service.processVerifiedEvent(paidEvent),
    ]);

    expect(results.map((result) => result.result).sort()).toEqual(['duplicate', 'processed']);
    expect(store.listAuditEvents()).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });

  it('records and ignores an out-of-order failure after payment is paid', async () => {
    const { store, service, notifications } = createSubject();
    await service.processVerifiedEvent(paidEvent);

    const result = await service.processVerifiedEvent({
      ...paidEvent,
      providerEventId: 'event-late-failure',
      providerStatus: 'failed',
      occurredAt: '2026-07-28T00:00:30.000Z',
    });

    expect(result.result).toBe('ignoredOutOfOrder');
    expect(result.status).toBe('paid');
    expect(store.listAuditEvents().at(-1)?.processingResult).toBe('ignoredOutOfOrder');
    expect(notifications).toHaveLength(1);
  });

  it('ignores a chronologically stale event even when its status transition is otherwise allowed', async () => {
    const { store, service, notifications } = createSubject();
    await service.processVerifiedEvent(paidEvent);

    const result = await service.processVerifiedEvent({
      ...paidEvent,
      providerEventId: 'event-stale-refund',
      providerStatus: 'refunded',
      occurredAt: '2026-07-28T00:00:30.000Z',
    });

    expect(result).toMatchObject({ result: 'ignoredOutOfOrder', status: 'paid' });
    expect(store.getPayment(payment.paymentRecordId)?.status).toBe('paid');
    expect(notifications).toHaveLength(1);
  });

  it('applies a provider failure from pending and creates a durable handoff', async () => {
    const { store, service, notifications } = createSubject();

    const result = await service.processVerifiedEvent({
      ...paidEvent,
      providerEventId: 'event-failed-001',
      providerStatus: 'failed',
    });

    expect(result).toMatchObject({ result: 'processed', status: 'failed' });
    expect(store.listAuditEvents()[0]).toMatchObject({
      providerEventId: 'event-failed-001',
      processingResult: 'processed',
      providerStatus: 'failed',
    });
    expect(notifications[0]).toMatchObject({
      idempotencyKey: 'payment-event-audit-001',
      paymentRecordId: payment.paymentRecordId,
      status: 'failed',
    });
    expect(store.listNotificationHandoffs()[0]).toMatchObject({
      idempotencyKey: 'payment-event-audit-001',
      deliveryStatus: 'pending',
    });
  });

  it('commits reconciliation and a pending handoff before triggering, retaining it on trigger failure', async () => {
    let storeAtTrigger: ReturnType<typeof createMemoryPaymentWebhookStore> | undefined;
    const subject = createSubject({
      triggerNotification: async () => {
        expect(storeAtTrigger?.getPayment(payment.paymentRecordId)?.status).toBe('paid');
        expect(storeAtTrigger?.listNotificationHandoffs()).toHaveLength(1);
        throw new Error('fixture trigger unavailable');
      },
    });
    storeAtTrigger = subject.store;

    await expect(subject.service.processVerifiedEvent(paidEvent)).resolves.toMatchObject({
      result: 'processed',
      status: 'paid',
    });
    expect(subject.store.listNotificationHandoffs()[0].deliveryStatus).toBe('pending');
  });

  it('rejects when backend-owned application pricing drifts even if event and payment agree', async () => {
    const { store, service } = createSubject({ applicationAmount: 50000 });

    await expect(service.processVerifiedEvent(paidEvent)).rejects.toMatchObject({
      code: 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH',
    });
    expect(store.getPayment(payment.paymentRecordId)?.status).toBe('pendingProvider');
    expect(store.listAuditEvents()[0]?.processingResult).toBe('rejected');
  });

  it('audit-records an unknown payment and maps atomic persistence failure', async () => {
    const emptyStore = createMemoryPaymentWebhookStore({ payments: [], applications: [] });
    const missingService = createPaymentWebhookService({
      store: emptyStore,
      createAuditId: () => 'payment-event-audit-missing',
    });
    await expect(missingService.processVerifiedEvent(paidEvent)).rejects.toMatchObject({
      code: 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND',
    });
    await expect(missingService.processVerifiedEvent(paidEvent)).rejects.toMatchObject({
      code: 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND',
    });
    expect(emptyStore.listAuditEvents()[0]?.processingResult).toBe('rejected');
    expect(emptyStore.listAuditEvents()).toHaveLength(1);

    const failingService = createPaymentWebhookService({
      store: {
        processVerifiedEvent: async () => {
          throw new Error('fixture persistence failure');
        },
      },
    });
    await expect(failingService.processVerifiedEvent(paidEvent)).rejects.toMatchObject({
      code: 'PAYMENT_WEBHOOK_PERSISTENCE_FAILED',
      status: 503,
    });
  });

  it.each([
    ['applicationId', 'application-other', 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH'],
    ['providerOrderId', 'provider-order-other', 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH'],
    ['providerPaymentId', 'provider-payment-other', 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH'],
    ['amount', 50000, 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH'],
    ['currency', 'USD', 'PAYMENT_WEBHOOK_EVENT_INVALID'],
  ])('rejects mismatched %s without changing payment state', async (field, value, code) => {
    const { store, service, notifications } = createSubject();

    await expect(service.processVerifiedEvent({
      ...paidEvent,
      [field]: value,
    })).rejects.toMatchObject({
      code: code as PaymentWebhookServiceError['code'],
    });
    expect(store.getPayment(payment.paymentRecordId)?.status).toBe('pendingProvider');
    if (field !== 'currency') {
      expect(store.listAuditEvents()[0]?.processingResult).toBe('rejected');
      await expect(service.processVerifiedEvent({
        ...paidEvent,
        [field]: value,
      })).rejects.toMatchObject({ code });
      expect(store.listAuditEvents()).toHaveLength(1);
    }
    expect(notifications).toHaveLength(0);
  });
});
