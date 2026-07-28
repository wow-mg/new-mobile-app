import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, or } from 'drizzle-orm';
import {
  paymentProviderWebhookEventSchema,
  paymentProviderWebhookResponseSchema,
  type PaymentProviderWebhookErrorCode,
  type PaymentProviderWebhookEvent,
  type PaymentProviderWebhookResponse,
  type PaymentStatus,
} from '@template/contracts';
import { db } from '../db/client.js';
import {
  paymentNotificationHandoffs,
  paymentProviderEvents,
  paymentRecords,
  tournamentApplications,
  tournamentDivisions,
} from '../db/schema.js';

type WebhookPaymentStatus = Extract<
  PaymentStatus,
  'orderCreated' | 'pendingProvider' | 'paid' | 'failed' | 'cancelled' | 'refunded'
>;

type WebhookPayment = {
  paymentRecordId: string;
  applicationId: string;
  participantId: string;
  status: WebhookPaymentStatus;
  providerPaymentId?: string;
  providerOrderId?: string;
  amount: number;
  currency: 'KRW';
};

type PricingApplication = {
  applicationId: string;
  participantId: string;
  amount: number;
  currency: 'KRW';
};

export type PaymentWebhookAuditEvent = {
  auditId: string;
  provider: 'kg_inicis';
  providerEventId?: string;
  eventHashVersion: 'v1';
  eventHash: string;
  paymentRecordId?: string;
  applicationId: string;
  providerPaymentId: string;
  providerOrderId: string;
  providerStatus: PaymentProviderWebhookEvent['providerStatus'];
  amount: number;
  currency: 'KRW';
  verificationResult: 'verified';
  processingResult: 'processed' | 'ignoredOutOfOrder' | 'rejected';
  rejectionCode?: PaymentProviderWebhookErrorCode;
  occurredAt: string;
  receivedAt: string;
  processedAt: string;
};

export type PaymentNotificationHandoff = {
  idempotencyKey: string;
  paymentRecordId: string;
  applicationId: string;
  participantId: string;
  status: WebhookPaymentStatus;
  deliveryStatus: 'pending';
};

type AtomicWebhookResult =
  | {
      kind: 'accepted';
      response: PaymentProviderWebhookResponse;
      notificationHandoff?: PaymentNotificationHandoff;
    }
  | {
      kind: 'rejected';
      code: Extract<
        PaymentProviderWebhookErrorCode,
        | 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND'
        | 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH'
        | 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH'
      >;
    };

export interface PaymentWebhookStore {
  processVerifiedEvent(input: {
    event: PaymentProviderWebhookEvent;
    eventHash: string;
    eventHashVersion: 'v1';
    auditId: string;
    receivedAt: string;
  }): Promise<AtomicWebhookResult>;
}

export interface PaymentWebhookVerifier {
  verify(input: { rawBody: Uint8Array; signature: string }): boolean;
}

export class PaymentWebhookServiceError extends Error {
  constructor(
    public readonly code: PaymentProviderWebhookErrorCode,
    public readonly status: 400 | 401 | 409 | 503,
  ) {
    super(code);
  }
}

const providerToPaymentStatus = {
  created: 'orderCreated',
  pending: 'pendingProvider',
  paid: 'paid',
  failed: 'failed',
  cancelled: 'cancelled',
  refunded: 'refunded',
} as const;

const allowedTransitions: Record<WebhookPaymentStatus, WebhookPaymentStatus[]> = {
  orderCreated: ['orderCreated', 'pendingProvider', 'paid', 'failed', 'cancelled'],
  pendingProvider: ['pendingProvider', 'paid', 'failed', 'cancelled'],
  paid: ['paid', 'refunded'],
  failed: ['failed'],
  cancelled: ['cancelled'],
  refunded: ['refunded'],
};

function canonicalEvent(event: PaymentProviderWebhookEvent) {
  return JSON.stringify({
    amount: event.amount,
    applicationId: event.applicationId,
    currency: event.currency,
    occurredAt: event.occurredAt,
    provider: event.provider,
    providerOrderId: event.providerOrderId,
    providerPaymentId: event.providerPaymentId,
    providerStatus: event.providerStatus,
  });
}

export function deterministicWebhookEventHash(event: PaymentProviderWebhookEvent) {
  return createHash('sha256').update(canonicalEvent(event)).digest('hex');
}

function referenceError(
  payment: WebhookPayment | undefined,
  application: PricingApplication | undefined,
  event: PaymentProviderWebhookEvent,
) {
  if (!payment) return 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND' as const;
  if (!application) return 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH' as const;
  if (
    payment.applicationId !== event.applicationId
    || payment.providerOrderId !== event.providerOrderId
    || payment.providerPaymentId !== event.providerPaymentId
    || application.applicationId !== event.applicationId
    || application.participantId !== payment.participantId
  ) {
    return 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH' as const;
  }
  if (
    payment.amount !== event.amount
    || application.amount !== event.amount
    || payment.currency !== event.currency
    || application.currency !== event.currency
  ) {
    return 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH' as const;
  }
  return undefined;
}

function auditFor(
  input: {
    event: PaymentProviderWebhookEvent;
    eventHash: string;
    auditId: string;
    receivedAt: string;
  },
  processingResult: PaymentWebhookAuditEvent['processingResult'],
  paymentRecordId?: string,
  rejectionCode?: PaymentProviderWebhookErrorCode,
): PaymentWebhookAuditEvent {
  return {
    auditId: input.auditId,
    provider: input.event.provider,
    providerEventId: input.event.providerEventId,
    eventHashVersion: 'v1',
    eventHash: input.eventHash,
    paymentRecordId,
    applicationId: input.event.applicationId,
    providerPaymentId: input.event.providerPaymentId,
    providerOrderId: input.event.providerOrderId,
    providerStatus: input.event.providerStatus,
    amount: input.event.amount,
    currency: input.event.currency,
    verificationResult: 'verified',
    processingResult,
    rejectionCode,
    occurredAt: input.event.occurredAt,
    receivedAt: input.receivedAt,
    processedAt: input.receivedAt,
  };
}

export function createMemoryPaymentWebhookStore(seed: {
  payments: WebhookPayment[];
  applications: PricingApplication[];
}) {
  const payments = new Map(seed.payments.map((payment) => [payment.paymentRecordId, { ...payment }]));
  const applications = new Map(seed.applications.map((application) => [application.applicationId, application]));
  const auditEvents: PaymentWebhookAuditEvent[] = [];
  const handoffs: PaymentNotificationHandoff[] = [];
  let queue = Promise.resolve();

  const store: PaymentWebhookStore & {
    listAuditEvents(): PaymentWebhookAuditEvent[];
    listNotificationHandoffs(): PaymentNotificationHandoff[];
    getPayment(id: string): WebhookPayment | undefined;
  } = {
    async processVerifiedEvent(input) {
      const previous = queue;
      let release = () => {};
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const duplicate = auditEvents.find((audit) => (
          (input.event.providerEventId && audit.providerEventId === input.event.providerEventId)
          || audit.eventHash === input.eventHash
        ));
        if (duplicate) {
          if (duplicate.processingResult === 'rejected' && duplicate.rejectionCode) {
            return {
              kind: 'rejected',
              code: duplicate.rejectionCode as Extract<
                PaymentProviderWebhookErrorCode,
                | 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND'
                | 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH'
                | 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH'
              >,
            };
          }
          const duplicatePayment = duplicate.paymentRecordId
            ? payments.get(duplicate.paymentRecordId)
            : undefined;
          if (!duplicatePayment) {
            return { kind: 'rejected', code: 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND' as const };
          }
          return {
            kind: 'accepted',
            response: paymentProviderWebhookResponseSchema.parse({
              accepted: true,
              result: 'duplicate',
              paymentRecordId: duplicatePayment.paymentRecordId,
              status: duplicatePayment.status,
            }),
          };
        }

        const payment = [...payments.values()].find((candidate) => (
          candidate.providerOrderId === input.event.providerOrderId
          || candidate.providerPaymentId === input.event.providerPaymentId
        ));
        const application = applications.get(input.event.applicationId);
        const mismatch = referenceError(payment, application, input.event);
        if (mismatch) {
          auditEvents.push(auditFor(input, 'rejected', payment?.paymentRecordId, mismatch));
          return { kind: 'rejected', code: mismatch };
        }
        if (!payment || !application) {
          throw new Error('verified webhook invariant failed');
        }

        const nextStatus = providerToPaymentStatus[input.event.providerStatus];
        const latestAppliedEvent = auditEvents
          .filter((audit) => (
            audit.paymentRecordId === payment.paymentRecordId
            && audit.processingResult === 'processed'
          ))
          .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
        const chronologicallyStale = Boolean(
          latestAppliedEvent && input.event.occurredAt < latestAppliedEvent.occurredAt,
        );
        const transitionAllowed = !chronologicallyStale
          && allowedTransitions[payment.status].includes(nextStatus);
        const stateChanged = transitionAllowed && payment.status !== nextStatus;
        const result = transitionAllowed ? 'processed' : 'ignoredOutOfOrder';
        if (stateChanged) payment.status = nextStatus;
        auditEvents.push(auditFor(input, result, payment.paymentRecordId));

        let notificationHandoff: PaymentNotificationHandoff | undefined;
        if (stateChanged) {
          notificationHandoff = {
            idempotencyKey: input.auditId,
            paymentRecordId: payment.paymentRecordId,
            applicationId: payment.applicationId,
            participantId: payment.participantId,
            status: payment.status,
            deliveryStatus: 'pending',
          };
          handoffs.push(notificationHandoff);
        }
        return {
          kind: 'accepted',
          response: paymentProviderWebhookResponseSchema.parse({
            accepted: true,
            result,
            paymentRecordId: payment.paymentRecordId,
            status: payment.status,
          }),
          notificationHandoff,
        };
      } finally {
        release();
      }
    },
    listAuditEvents: () => [...auditEvents],
    listNotificationHandoffs: () => [...handoffs],
    getPayment: (id) => payments.get(id),
  };
  return store;
}

export function createPaymentWebhookService(dependencies: {
  store: PaymentWebhookStore;
  now?: () => Date;
  createAuditId?: () => string;
  triggerNotification?: (handoff: PaymentNotificationHandoff) => Promise<void>;
}) {
  const now = dependencies.now ?? (() => new Date());
  const createAuditId = dependencies.createAuditId ?? (() => `payment-event-${crypto.randomUUID()}`);
  const triggerNotification = dependencies.triggerNotification ?? (async () => {});

  return {
    async processVerifiedEvent(unknownEvent: unknown) {
      const parsed = paymentProviderWebhookEventSchema.safeParse(unknownEvent);
      if (!parsed.success) throw new PaymentWebhookServiceError('PAYMENT_WEBHOOK_EVENT_INVALID', 400);
      let result: AtomicWebhookResult;
      try {
        result = await dependencies.store.processVerifiedEvent({
          event: parsed.data,
          eventHash: deterministicWebhookEventHash(parsed.data),
          eventHashVersion: 'v1',
          auditId: createAuditId(),
          receivedAt: now().toISOString(),
        });
      } catch {
        throw new PaymentWebhookServiceError('PAYMENT_WEBHOOK_PERSISTENCE_FAILED', 503);
      }
      if (result.kind === 'rejected') {
        throw new PaymentWebhookServiceError(result.code, 409);
      }
      if (result.notificationHandoff) {
        try {
          await triggerNotification(result.notificationHandoff);
        } catch {
          // The durable pending handoff is the retry source; provider secrets and errors are never logged.
        }
      }
      return result.response;
    },
  };
}

function rowToPayment(row: typeof paymentRecords.$inferSelect): WebhookPayment {
  return {
    paymentRecordId: row.paymentRecordId,
    applicationId: row.applicationId,
    participantId: row.participantId,
    status: row.status as WebhookPaymentStatus,
    providerPaymentId: row.providerPaymentId ?? undefined,
    providerOrderId: row.providerOrderId ?? undefined,
    amount: row.amount ?? row.amountKrw,
    currency: 'KRW',
  };
}

export function createDatabasePaymentWebhookStore(database: typeof db): PaymentWebhookStore {
  return {
  async processVerifiedEvent(input) {
    try {
      return await database.transaction(async (tx) => {
        const duplicateConditions = [
          and(
            eq(paymentProviderEvents.provider, input.event.provider),
            eq(paymentProviderEvents.eventHashVersion, input.eventHashVersion),
            eq(paymentProviderEvents.eventHash, input.eventHash),
          ),
        ];
        if (input.event.providerEventId) {
          duplicateConditions.push(and(
            eq(paymentProviderEvents.provider, input.event.provider),
            eq(paymentProviderEvents.providerEventId, input.event.providerEventId),
          ));
        }
        const [duplicate] = await tx.select().from(paymentProviderEvents)
          .where(or(...duplicateConditions))
          .limit(1);
        if (duplicate?.paymentRecordId) {
          if (duplicate.processingResult === 'rejected' && duplicate.rejectionCode) {
            return {
              kind: 'rejected' as const,
              code: duplicate.rejectionCode as Extract<
                PaymentProviderWebhookErrorCode,
                | 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND'
                | 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH'
                | 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH'
              >,
            };
          }
          const [row] = await tx.select().from(paymentRecords)
            .where(eq(paymentRecords.paymentRecordId, duplicate.paymentRecordId))
            .limit(1);
          if (row) {
            const payment = rowToPayment(row);
            return {
              kind: 'accepted' as const,
              response: paymentProviderWebhookResponseSchema.parse({
                accepted: true,
                result: 'duplicate',
                paymentRecordId: payment.paymentRecordId,
                status: payment.status,
              }),
            };
          }
        }

        if (duplicate?.processingResult === 'rejected' && duplicate.rejectionCode) {
          return {
            kind: 'rejected' as const,
            code: duplicate.rejectionCode as Extract<
              PaymentProviderWebhookErrorCode,
              | 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND'
              | 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH'
              | 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH'
            >,
          };
        }

        const [paymentRow] = await tx.select().from(paymentRecords).where(or(
          eq(paymentRecords.providerOrderId, input.event.providerOrderId),
          eq(paymentRecords.providerPaymentId, input.event.providerPaymentId),
        )).for('update').limit(1);
        const payment = paymentRow ? rowToPayment(paymentRow) : undefined;
        const [applicationRow] = await tx.select({
          applicationId: tournamentApplications.applicationId,
          participantId: tournamentApplications.participantId,
          entryFeeKrw: tournamentDivisions.entryFeeKrw,
        }).from(tournamentApplications)
          .leftJoin(
            tournamentDivisions,
            eq(tournamentApplications.divisionId, tournamentDivisions.divisionId),
          )
          .where(eq(tournamentApplications.applicationId, input.event.applicationId))
          .limit(1);
        const application = applicationRow?.entryFeeKrw == null ? undefined : {
          applicationId: applicationRow.applicationId,
          participantId: applicationRow.participantId,
          amount: applicationRow.entryFeeKrw,
          currency: 'KRW' as const,
        };
        const mismatch = referenceError(payment, application, input.event);
        const processedAt = input.receivedAt;
        const [latestAppliedEvent] = payment
          ? await tx.select({ occurredAt: paymentProviderEvents.occurredAt })
              .from(paymentProviderEvents)
              .where(and(
                eq(paymentProviderEvents.paymentRecordId, payment.paymentRecordId),
                eq(paymentProviderEvents.processingResult, 'processed'),
              ))
              .orderBy(desc(paymentProviderEvents.occurredAt))
              .limit(1)
          : [];
        const chronologicallyStale = Boolean(
          latestAppliedEvent
          && new Date(input.event.occurredAt).getTime() < latestAppliedEvent.occurredAt.getTime(),
        );
        const audit = auditFor(
          input,
          mismatch ? 'rejected' : (
            !chronologicallyStale
            && allowedTransitions[payment!.status].includes(providerToPaymentStatus[input.event.providerStatus])
              ? 'processed'
              : 'ignoredOutOfOrder'
          ),
          payment?.paymentRecordId,
          mismatch,
        );
        await tx.insert(paymentProviderEvents).values({
          paymentProviderEventAuditId: audit.auditId,
          provider: audit.provider,
          providerEventId: audit.providerEventId,
          eventHashVersion: audit.eventHashVersion,
          eventHash: audit.eventHash,
          paymentRecordId: audit.paymentRecordId,
          applicationId: audit.applicationId,
          providerPaymentId: audit.providerPaymentId,
          providerOrderId: audit.providerOrderId,
          providerStatus: audit.providerStatus,
          amount: audit.amount,
          currency: audit.currency,
          verificationResult: audit.verificationResult,
          processingResult: audit.processingResult,
          rejectionCode: audit.rejectionCode,
          occurredAt: new Date(audit.occurredAt),
          receivedAt: new Date(audit.receivedAt),
          processedAt: new Date(processedAt),
        });
        if (mismatch) return { kind: 'rejected' as const, code: mismatch };

        const nextStatus = providerToPaymentStatus[input.event.providerStatus];
        const transitionAllowed = !chronologicallyStale
          && allowedTransitions[payment!.status].includes(nextStatus);
        const stateChanged = transitionAllowed && payment!.status !== nextStatus;
        if (stateChanged) {
          await tx.update(paymentRecords).set({
            status: nextStatus,
            providerStatus: input.event.providerStatus,
            reconciledAt: new Date(processedAt),
            updatedAt: new Date(processedAt),
          }).where(eq(paymentRecords.paymentRecordId, payment!.paymentRecordId));
          await tx.insert(paymentNotificationHandoffs).values({
            paymentNotificationHandoffId: `payment-handoff-${audit.auditId}`,
            paymentProviderEventAuditId: audit.auditId,
            idempotencyKey: audit.auditId,
            paymentRecordId: payment!.paymentRecordId,
            applicationId: payment!.applicationId,
            participantId: payment!.participantId,
            status: nextStatus,
            deliveryStatus: 'pending',
            createdAt: new Date(processedAt),
          });
        }
        const finalStatus = stateChanged ? nextStatus : payment!.status;
        return {
          kind: 'accepted' as const,
          response: paymentProviderWebhookResponseSchema.parse({
            accepted: true,
            result: transitionAllowed ? 'processed' : 'ignoredOutOfOrder',
            paymentRecordId: payment!.paymentRecordId,
            status: finalStatus,
          }),
          notificationHandoff: stateChanged ? {
            idempotencyKey: audit.auditId,
            paymentRecordId: payment!.paymentRecordId,
            applicationId: payment!.applicationId,
            participantId: payment!.participantId,
            status: finalStatus,
            deliveryStatus: 'pending' as const,
          } : undefined,
        };
      });
    } catch (error) {
      const databaseError = error as { code?: string };
      if (databaseError.code === '23505') {
        const [duplicate] = await database.select().from(paymentProviderEvents).where(or(
          and(
            eq(paymentProviderEvents.provider, input.event.provider),
            eq(paymentProviderEvents.eventHashVersion, input.eventHashVersion),
            eq(paymentProviderEvents.eventHash, input.eventHash),
          ),
          input.event.providerEventId
            ? and(
                eq(paymentProviderEvents.provider, input.event.provider),
                eq(paymentProviderEvents.providerEventId, input.event.providerEventId),
              )
            : undefined,
        )).limit(1);
        if (duplicate?.processingResult === 'rejected' && duplicate.rejectionCode) {
          return {
            kind: 'rejected',
            code: duplicate.rejectionCode as Extract<
              PaymentProviderWebhookErrorCode,
              | 'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND'
              | 'PAYMENT_WEBHOOK_REFERENCE_MISMATCH'
              | 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH'
            >,
          };
        }
        if (duplicate?.paymentRecordId) {
          const [row] = await database.select().from(paymentRecords)
            .where(eq(paymentRecords.paymentRecordId, duplicate.paymentRecordId))
            .limit(1);
          if (row) {
            const payment = rowToPayment(row);
            return {
              kind: 'accepted',
              response: paymentProviderWebhookResponseSchema.parse({
                accepted: true,
                result: 'duplicate',
                paymentRecordId: payment.paymentRecordId,
                status: payment.status,
              }),
            };
          }
        }
      }
      throw error;
    }
  },
  };
};

const databaseWebhookStore = createDatabasePaymentWebhookStore(db);

export function createFixturePaymentWebhookVerifier(): PaymentWebhookVerifier {
  return {
    verify({ rawBody, signature }) {
      const expected = Buffer.from(createFixturePaymentWebhookSignature(rawBody));
      const received = Buffer.from(signature);
      return expected.length === received.length && timingSafeEqual(expected, received);
    },
  };
}

const FIXTURE_WEBHOOK_KEY = 'fixture-placeholder-signing-key';

export function createFixturePaymentWebhookSignature(rawBody: Uint8Array) {
  return createHmac('sha256', FIXTURE_WEBHOOK_KEY).update(rawBody).digest('hex');
}

export function createRuntimePaymentWebhookVerifier(): PaymentWebhookVerifier {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return createFixturePaymentWebhookVerifier();
  }
  // Final KG Inicis signing rules are not available in this 3C fixture-only scope.
  // Runtime fails closed until the documented verifier is injected in a later approved step.
  return { verify: () => false };
}

let defaultService: ReturnType<typeof createPaymentWebhookService> | undefined;
export function getPaymentWebhookService() {
  defaultService ??= createPaymentWebhookService({ store: databaseWebhookStore });
  return defaultService;
}
