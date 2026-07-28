import { and, asc, desc, eq } from 'drizzle-orm';
import {
  adminRefundRequestResponseSchema,
  refundHistoryResponseSchema,
  refundRequestSchema,
  type AdminApiErrorCode,
  type AdminRefundRequestResponse,
  type ApproveRefundRequest,
  type CreateRefundRequest,
  type PaymentApiErrorCode,
  type PaymentStatus,
  type RefundHistoryEntry,
  type RefundPolicyDecision,
  type RefundRequest,
  type RefundRequestStatus,
  type RefundTransaction,
  type RejectRefundRequest,
  type RequestProviderRefund,
  type TournamentApplicationStatus,
} from '@template/contracts';
import { db } from '../db/client.js';
import {
  paymentRecords,
  refundHistory,
  refundRequests,
  refundTransactions,
  tournamentApplications,
  tournaments,
} from '../db/schema.js';
import { evaluateRefundPolicy, RefundPolicyError } from './refund-policy.service.js';
import {
  createMockRefundProviderClient,
  type RefundProviderClient,
} from './refund-provider.client.js';

type RefundErrorCode = PaymentApiErrorCode | AdminApiErrorCode;

export class RefundServiceError extends Error {
  constructor(
    public readonly code: RefundErrorCode,
    public readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(code);
  }
}

export type RefundPaymentContext = {
  applicationId: string;
  paymentRecordId: string;
  participantId: string;
  tournamentId: string;
  applicationStatus: TournamentApplicationStatus;
  paymentStatus: PaymentStatus;
  paymentMode: 'operatorManagedOffline' | 'card' | 'simplePay';
  paidAmountKrw: number;
  currency: 'KRW';
  recordedAt: string;
  serviceStartsAt: Date;
  fullRefundCutoffHours?: number;
  partialRefundCutoffHours?: number;
  partialRefundPercent?: number;
};

type PolicySnapshot = {
  serviceStartsAt: string;
  fullRefundCutoffHours: number;
  partialRefundCutoffHours: number;
  partialRefundPercent: number;
  priorApplicationStatus?: TournamentApplicationStatus;
  priorPaymentStatus?: PaymentStatus;
  tournamentId?: string;
};

type StoredRefund = Omit<RefundRequest, 'history'> & {
  participantId: string;
  tournamentId: string;
  priorApplicationStatus: TournamentApplicationStatus;
  priorPaymentStatus: PaymentStatus;
  policySnapshot: PolicySnapshot;
  operatorReason?: string;
};

type StoredState = {
  context: RefundPaymentContext;
  refund?: StoredRefund;
  history: RefundHistoryEntry[];
  transactions: Array<RefundTransaction & { idempotencyKey: string }>;
};

type TransitionInput = {
  expectedStatus: RefundRequestStatus;
  expectedApplicationStatus: TournamentApplicationStatus;
  expectedPaymentStatus: PaymentStatus;
  refund: StoredRefund;
  history: RefundHistoryEntry;
  applicationStatus: TournamentApplicationStatus;
  paymentStatus: PaymentStatus;
  insertTransaction?: RefundTransaction & { idempotencyKey: string };
  updateTransaction?: RefundTransaction & { idempotencyKey: string };
};

export interface RefundStore {
  findContext(paymentRecordId: string): Promise<RefundPaymentContext | undefined>;
  findByPayment(paymentRecordId: string): Promise<StoredState | undefined>;
  findById(refundRequestId: string): Promise<StoredState | undefined>;
  listRefunds(): Promise<StoredState[]>;
  create(refund: StoredRefund, history: RefundHistoryEntry): Promise<StoredState>;
  transition(input: TransitionInput): Promise<StoredState>;
  inspect?(): Record<string, unknown>;
}

function publicRefund(state: StoredState): RefundRequest {
  const refund = state.refund;
  if (!refund) throw new RefundServiceError('REFUND_REQUEST_NOT_FOUND', 404);
  const {
    participantId: _participantId,
    tournamentId: _tournamentId,
    priorApplicationStatus: _priorApplicationStatus,
    priorPaymentStatus: _priorPaymentStatus,
    policySnapshot: _policySnapshot,
    operatorReason: _operatorReason,
    ...publicFields
  } = refund;
  return refundRequestSchema.parse({ ...publicFields, history: state.history });
}

function adminResponse(state: StoredState): AdminRefundRequestResponse {
  const latest = state.transactions.at(-1);
  const latestTransaction = latest
    ? (({ idempotencyKey: _idempotencyKey, ...transaction }) => transaction)(latest)
    : undefined;
  return adminRefundRequestResponseSchema.parse({
    refundRequest: publicRefund(state),
    latestTransaction,
  });
}

function historyEntry(input: {
  id: string;
  event: RefundHistoryEntry['event'];
  actorKind: RefundHistoryEntry['actorKind'];
  refundStatus: RefundRequestStatus;
  applicationStatus: TournamentApplicationStatus;
  paymentStatus: PaymentStatus;
  amountKrw?: number;
  message: string;
  createdAt: string;
}): RefundHistoryEntry {
  return {
    refundHistoryId: input.id,
    event: input.event,
    actorKind: input.actorKind,
    refundStatus: input.refundStatus,
    applicationStatus: input.applicationStatus,
    paymentStatus: input.paymentStatus,
    amountKrw: input.amountKrw,
    currency: input.amountKrw === undefined ? undefined : 'KRW',
    message: input.message,
    createdAt: input.createdAt,
  };
}

export function createRefundService(dependencies: {
  store: RefundStore;
  provider: RefundProviderClient;
  now?: () => Date;
  createId?: () => string;
}) {
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? (() => crypto.randomUUID());

  return {
    async requestRefund(
      participantId: string,
      paymentRecordId: string,
      input: CreateRefundRequest,
    ) {
      const context = await dependencies.store.findContext(paymentRecordId);
      if (!context) throw new RefundServiceError('PAYMENT_RECORD_NOT_FOUND', 404);
      if (context.participantId !== participantId) {
        throw new RefundServiceError('PAYMENT_APPLICATION_OWNERSHIP_MISMATCH', 403);
      }
      if (await dependencies.store.findByPayment(paymentRecordId)) {
        throw new RefundServiceError('REFUND_INVALID_TRANSITION', 409);
      }
      if (context.paymentStatus !== 'paid' && context.paymentStatus !== 'confirmedOffline') {
        throw new RefundServiceError('REFUND_INVALID_TRANSITION', 409);
      }

      const requestedAt = now();
      let evaluated: { decision: RefundPolicyDecision; amountKrw: number };
      try {
        evaluated = evaluateRefundPolicy({
          paidAmountKrw: context.paidAmountKrw,
          requestedAt,
          serviceStartsAt: context.serviceStartsAt,
          fullRefundCutoffHours: context.fullRefundCutoffHours,
          partialRefundCutoffHours: context.partialRefundCutoffHours,
          partialRefundPercent: context.partialRefundPercent,
        });
      } catch (error) {
        if (error instanceof RefundPolicyError) {
          throw new RefundServiceError('REFUND_POLICY_UNAVAILABLE', 409);
        }
        throw error;
      }

      const timestamp = requestedAt.toISOString();
      const refund: StoredRefund = {
        refundRequestId: createId(),
        paymentRecordId,
        applicationId: context.applicationId,
        participantId,
        tournamentId: context.tournamentId,
        status: 'operatorReview',
        policyDecision: evaluated.decision,
        applicationStatus: 'cancellationRequested',
        paymentStatus: 'refundRequested',
        paidAmountKrw: context.paidAmountKrw,
        requestedAmountKrw: evaluated.amountKrw,
        currency: 'KRW',
        reason: input.reason,
        requestedAt: timestamp,
        updatedAt: timestamp,
        priorApplicationStatus: context.applicationStatus,
        priorPaymentStatus: context.paymentStatus,
        policySnapshot: {
          serviceStartsAt: context.serviceStartsAt.toISOString(),
          fullRefundCutoffHours: context.fullRefundCutoffHours!,
          partialRefundCutoffHours: context.partialRefundCutoffHours!,
          partialRefundPercent: context.partialRefundPercent!,
        },
      };
      const state = await dependencies.store.create(refund, historyEntry({
        id: createId(),
        event: 'requested',
        actorKind: 'customer',
        refundStatus: refund.status,
        applicationStatus: refund.applicationStatus,
        paymentStatus: refund.paymentStatus,
        amountKrw: refund.requestedAmountKrw,
        message: 'Refund request received for operator review.',
        createdAt: timestamp,
      }));
      return publicRefund(state);
    },

    async readRefundHistory(participantId: string, paymentRecordId: string) {
      const context = await dependencies.store.findContext(paymentRecordId);
      if (!context) throw new RefundServiceError('PAYMENT_RECORD_NOT_FOUND', 404);
      if (context.participantId !== participantId) {
        throw new RefundServiceError('PAYMENT_APPLICATION_OWNERSHIP_MISMATCH', 403);
      }
      const state = await dependencies.store.findByPayment(paymentRecordId);
      if (!state) throw new RefundServiceError('REFUND_REQUEST_NOT_FOUND', 404);
      return refundHistoryResponseSchema.parse({ refundRequest: publicRefund(state) });
    },

    async listRefundsForAdmin() {
      return (await dependencies.store.listRefunds()).map((state) => ({
        context: state.context,
        refundRequest: publicRefund(state),
      }));
    },

    async approveRefund(refundRequestId: string, input: ApproveRefundRequest) {
      const state = await dependencies.store.findById(refundRequestId);
      if (!state?.refund) throw new RefundServiceError('ADMIN_API_NOT_FOUND', 404);
      if (state.refund.status !== 'operatorReview') {
        throw new RefundServiceError('ADMIN_REFUND_INVALID_TRANSITION', 409);
      }

      let decision = state.refund.policyDecision;
      let amountKrw = state.refund.requestedAmountKrw;
      if (input.override) {
        try {
          const evaluated = evaluateRefundPolicy({
            paidAmountKrw: state.refund.paidAmountKrw,
            requestedAt: new Date(state.refund.requestedAt),
            serviceStartsAt: new Date(state.refund.policySnapshot.serviceStartsAt),
            fullRefundCutoffHours: state.refund.policySnapshot.fullRefundCutoffHours,
            partialRefundCutoffHours: state.refund.policySnapshot.partialRefundCutoffHours,
            partialRefundPercent: state.refund.policySnapshot.partialRefundPercent,
            override: input.override,
          });
          decision = evaluated.decision;
          amountKrw = evaluated.amountKrw;
        } catch (error) {
          if (error instanceof RefundPolicyError) {
            throw new RefundServiceError('ADMIN_REFUND_OVERRIDE_INVALID', 400);
          }
          throw error;
        }
      }

      const timestamp = now().toISOString();
      const refund: StoredRefund = {
        ...state.refund,
        status: 'approved',
        policyDecision: decision,
        approvedAmountKrw: amountKrw,
        applicationStatus: 'cancellationApproved',
        paymentStatus: 'refundApproved',
        updatedAt: timestamp,
        operatorReason: input.override?.reason,
      };
      return adminResponse(await dependencies.store.transition({
        expectedStatus: 'operatorReview',
        expectedApplicationStatus: 'cancellationRequested',
        expectedPaymentStatus: 'refundRequested',
        refund,
        applicationStatus: refund.applicationStatus,
        paymentStatus: refund.paymentStatus,
        history: historyEntry({
          id: createId(),
          event: 'approved',
          actorKind: 'operator',
          refundStatus: refund.status,
          applicationStatus: refund.applicationStatus,
          paymentStatus: refund.paymentStatus,
          amountKrw,
          message: 'Refund request approved.',
          createdAt: timestamp,
        }),
      }));
    },

    async rejectRefund(refundRequestId: string, input: RejectRefundRequest) {
      const state = await dependencies.store.findById(refundRequestId);
      if (!state?.refund) throw new RefundServiceError('ADMIN_API_NOT_FOUND', 404);
      if (state.refund.status !== 'operatorReview') {
        throw new RefundServiceError('ADMIN_REFUND_INVALID_TRANSITION', 409);
      }
      const timestamp = now().toISOString();
      const refund: StoredRefund = {
        ...state.refund,
        status: 'rejected',
        applicationStatus: state.refund.priorApplicationStatus,
        paymentStatus: state.refund.priorPaymentStatus,
        updatedAt: timestamp,
        operatorReason: input.reason,
      };
      return adminResponse(await dependencies.store.transition({
        expectedStatus: 'operatorReview',
        expectedApplicationStatus: 'cancellationRequested',
        expectedPaymentStatus: 'refundRequested',
        refund,
        applicationStatus: refund.applicationStatus,
        paymentStatus: refund.paymentStatus,
        history: historyEntry({
          id: createId(),
          event: 'rejected',
          actorKind: 'operator',
          refundStatus: refund.status,
          applicationStatus: refund.applicationStatus,
          paymentStatus: refund.paymentStatus,
          message: 'Refund request rejected.',
          createdAt: timestamp,
        }),
      }));
    },

    async requestProviderRefund(
      refundRequestId: string,
      input: RequestProviderRefund,
    ) {
      const state = await dependencies.store.findById(refundRequestId);
      if (!state?.refund) throw new RefundServiceError('ADMIN_API_NOT_FOUND', 404);
      const replay = state.transactions.find(
        (transaction) => transaction.idempotencyKey === input.idempotencyKey,
      );
      if (replay) {
        if (replay.status === 'mockFailed') {
          throw new RefundServiceError('ADMIN_REFUND_PROVIDER_UNAVAILABLE', 503);
        }
        return adminResponse(state);
      }
      if (state.refund.status !== 'approved') {
        throw new RefundServiceError('ADMIN_REFUND_INVALID_TRANSITION', 409);
      }

      const timestamp = now().toISOString();
      const amountKrw = state.refund.approvedAmountKrw ?? state.refund.requestedAmountKrw;
      const pendingTransaction = {
        refundTransactionId: createId(),
        refundRequestId,
        idempotencyKey: input.idempotencyKey,
        providerKind: 'sandboxMock' as const,
        status: 'mockPending' as const,
        amountKrw,
        currency: 'KRW' as const,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const pendingRefund: StoredRefund = {
        ...state.refund,
        status: 'providerPending',
        paymentStatus: 'refundPendingProvider',
        updatedAt: timestamp,
      };
      await dependencies.store.transition({
        expectedStatus: 'approved',
        expectedApplicationStatus: 'cancellationApproved',
        expectedPaymentStatus: 'refundApproved',
        refund: pendingRefund,
        applicationStatus: pendingRefund.applicationStatus,
        paymentStatus: pendingRefund.paymentStatus,
        insertTransaction: pendingTransaction,
        history: historyEntry({
          id: createId(),
          event: 'providerRequested',
          actorKind: 'operator',
          refundStatus: pendingRefund.status,
          applicationStatus: pendingRefund.applicationStatus,
          paymentStatus: pendingRefund.paymentStatus,
          amountKrw,
          message: 'Sandbox provider refund requested.',
          createdAt: timestamp,
        }),
      });

      let providerResult: Awaited<ReturnType<RefundProviderClient['requestRefund']>>;
      try {
        providerResult = await dependencies.provider.requestRefund({
          refundRequestId,
          amountKrw,
          currency: 'KRW',
          idempotencyKey: input.idempotencyKey,
        });
      } catch {
        const failedAt = now().toISOString();
        const failedRefund: StoredRefund = {
          ...pendingRefund,
          status: 'providerFailed',
          paymentStatus: 'refundApproved',
          updatedAt: failedAt,
        };
        await dependencies.store.transition({
          expectedStatus: 'providerPending',
          expectedApplicationStatus: 'cancellationApproved',
          expectedPaymentStatus: 'refundPendingProvider',
          refund: failedRefund,
          applicationStatus: failedRefund.applicationStatus,
          paymentStatus: failedRefund.paymentStatus,
          updateTransaction: {
            ...pendingTransaction,
            status: 'mockFailed',
            updatedAt: failedAt,
          },
          history: historyEntry({
            id: createId(),
            event: 'providerFailed',
            actorKind: 'sandboxProvider',
            refundStatus: failedRefund.status,
            applicationStatus: failedRefund.applicationStatus,
            paymentStatus: failedRefund.paymentStatus,
            amountKrw,
            message: 'Sandbox provider refund failed.',
            createdAt: failedAt,
          }),
        });
        throw new RefundServiceError('ADMIN_REFUND_PROVIDER_UNAVAILABLE', 503);
      }

      const completedAt = now().toISOString();
      const completedRefund: StoredRefund = {
        ...pendingRefund,
        status: 'refunded',
        applicationStatus: 'cancelled',
        paymentStatus: 'refunded',
        updatedAt: completedAt,
      };
      return adminResponse(await dependencies.store.transition({
        expectedStatus: 'providerPending',
        expectedApplicationStatus: 'cancellationApproved',
        expectedPaymentStatus: 'refundPendingProvider',
        refund: completedRefund,
        applicationStatus: completedRefund.applicationStatus,
        paymentStatus: completedRefund.paymentStatus,
        updateTransaction: {
          ...pendingTransaction,
          status: 'mockSucceeded',
          providerReference: providerResult.providerReference,
          updatedAt: completedAt,
        },
        history: historyEntry({
          id: createId(),
          event: 'providerSucceeded',
          actorKind: 'sandboxProvider',
          refundStatus: completedRefund.status,
          applicationStatus: completedRefund.applicationStatus,
          paymentStatus: completedRefund.paymentStatus,
          amountKrw,
          message: 'Sandbox provider refund completed.',
          createdAt: completedAt,
        }),
      }));
    },
  };
}

export function createRefundTestStore(seed: RefundPaymentContext): RefundStore & {
  inspect(): Record<string, unknown>;
} {
  let state: StoredState = { context: { ...seed }, history: [], transactions: [] };
  return {
    async findContext(paymentRecordId) {
      return state.context.paymentRecordId === paymentRecordId
        ? { ...state.context }
        : undefined;
    },
    async findByPayment(paymentRecordId) {
      return state.refund?.paymentRecordId === paymentRecordId ? structuredClone(state) : undefined;
    },
    async findById(refundRequestId) {
      return state.refund?.refundRequestId === refundRequestId ? structuredClone(state) : undefined;
    },
    async listRefunds() {
      return state.refund ? [structuredClone(state)] : [];
    },
    async create(refund, history) {
      if (state.refund) throw new RefundServiceError('REFUND_INVALID_TRANSITION', 409);
      state = {
        ...state,
        context: {
          ...state.context,
          applicationStatus: refund.applicationStatus,
          paymentStatus: refund.paymentStatus,
        },
        refund: structuredClone(refund),
        history: [structuredClone(history)],
      };
      return structuredClone(state);
    },
    async transition(input) {
      if (
        !state.refund
        || state.refund.status !== input.expectedStatus
        || state.context.applicationStatus !== input.expectedApplicationStatus
        || state.context.paymentStatus !== input.expectedPaymentStatus
      ) {
        throw new RefundServiceError('ADMIN_REFUND_INVALID_TRANSITION', 409);
      }
      const transactions = [...state.transactions];
      if (input.insertTransaction) transactions.push(structuredClone(input.insertTransaction));
      if (input.updateTransaction) {
        const index = transactions.findIndex(
          (item) => item.refundTransactionId === input.updateTransaction!.refundTransactionId,
        );
        if (index < 0) throw new RefundServiceError('ADMIN_REFUND_INVALID_TRANSITION', 409);
        transactions[index] = structuredClone(input.updateTransaction);
      }
      state = {
        context: {
          ...state.context,
          applicationStatus: input.applicationStatus,
          paymentStatus: input.paymentStatus,
        },
        refund: structuredClone(input.refund),
        history: [...state.history, structuredClone(input.history)],
        transactions,
      };
      return structuredClone(state);
    },
    inspect() {
      return {
        applicationStatus: state.context.applicationStatus,
        paymentStatus: state.context.paymentStatus,
        durableAuditEvents: state.history.length,
        latestTransactionStatus: state.transactions.at(-1)?.status,
      };
    },
  };
}

function parseStoredRefund(row: typeof refundRequests.$inferSelect): StoredRefund {
  const snapshot = row.policySnapshot as PolicySnapshot;
  return {
    refundRequestId: row.refundRequestId,
    paymentRecordId: row.paymentRecordId,
    applicationId: row.applicationId,
    participantId: row.participantId,
    tournamentId: snapshot.tournamentId ?? '',
    status: row.status as RefundRequestStatus,
    policyDecision: row.policyDecision as RefundPolicyDecision,
    applicationStatus: 'submitted',
    paymentStatus: 'paid',
    paidAmountKrw: row.paidAmountKrw,
    requestedAmountKrw: row.requestedAmountKrw,
    approvedAmountKrw: row.approvedAmountKrw ?? undefined,
    currency: 'KRW',
    reason: row.reason,
    requestedAt: row.requestedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    priorApplicationStatus: snapshot.priorApplicationStatus ?? 'submitted',
    priorPaymentStatus: snapshot.priorPaymentStatus ?? 'paid',
    policySnapshot: snapshot,
    operatorReason: row.operatorReason ?? undefined,
  };
}

function parseHistory(row: typeof refundHistory.$inferSelect): RefundHistoryEntry {
  return {
    refundHistoryId: row.refundHistoryId,
    event: row.event as RefundHistoryEntry['event'],
    actorKind: row.actorKind as RefundHistoryEntry['actorKind'],
    refundStatus: row.refundStatus as RefundRequestStatus,
    applicationStatus: row.applicationStatus as TournamentApplicationStatus,
    paymentStatus: row.paymentStatus as PaymentStatus,
    amountKrw: row.amountKrw ?? undefined,
    currency: row.currency === 'KRW' ? 'KRW' : undefined,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseTransaction(
  row: typeof refundTransactions.$inferSelect,
): RefundTransaction & { idempotencyKey: string } {
  return {
    refundTransactionId: row.refundTransactionId,
    refundRequestId: row.refundRequestId,
    idempotencyKey: row.idempotencyKey,
    providerKind: 'sandboxMock',
    status: row.status as RefundTransaction['status'],
    amountKrw: row.amountKrw,
    currency: 'KRW',
    providerReference: row.providerReference ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const databaseStore: RefundStore = {
  async findContext(paymentRecordId) {
    const [payment] = await db.select().from(paymentRecords)
      .where(eq(paymentRecords.paymentRecordId, paymentRecordId)).limit(1);
    if (!payment) return undefined;
    const [application] = await db.select().from(tournamentApplications)
      .where(eq(tournamentApplications.applicationId, payment.applicationId)).limit(1);
    if (!application) return undefined;
    const [tournament] = await db.select().from(tournaments)
      .where(eq(tournaments.tournamentId, application.tournamentId)).limit(1);
    if (!tournament) return undefined;
    return {
      applicationId: application.applicationId,
      paymentRecordId: payment.paymentRecordId,
      participantId: payment.participantId,
      tournamentId: application.tournamentId,
      applicationStatus: application.status as TournamentApplicationStatus,
      paymentStatus: payment.status as PaymentStatus,
      paymentMode: payment.paymentMode as RefundPaymentContext['paymentMode'],
      paidAmountKrw: payment.amount ?? payment.amountKrw,
      currency: 'KRW',
      recordedAt: payment.recordedAt.toISOString(),
      serviceStartsAt: tournament.startsAt,
      fullRefundCutoffHours: tournament.fullRefundCutoffHours ?? undefined,
      partialRefundCutoffHours: tournament.partialRefundCutoffHours ?? undefined,
      partialRefundPercent: tournament.partialRefundPercent ?? undefined,
    };
  },
  async findByPayment(paymentRecordId) {
    const [row] = await db.select().from(refundRequests)
      .where(eq(refundRequests.paymentRecordId, paymentRecordId)).limit(1);
    return row ? readDatabaseState(row) : undefined;
  },
  async findById(refundRequestId) {
    const [row] = await db.select().from(refundRequests)
      .where(eq(refundRequests.refundRequestId, refundRequestId)).limit(1);
    return row ? readDatabaseState(row) : undefined;
  },
  async listRefunds() {
    const rows = await db.select().from(refundRequests).orderBy(desc(refundRequests.requestedAt));
    return Promise.all(rows.map(readDatabaseState));
  },
  async create(refund, history) {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(refundRequests).values(storedRefundValues(refund));
        const [application] = await tx.update(tournamentApplications)
          .set({ status: refund.applicationStatus, paymentStatus: refund.paymentStatus })
          .where(and(
            eq(tournamentApplications.applicationId, refund.applicationId),
            eq(tournamentApplications.status, refund.priorApplicationStatus),
            eq(tournamentApplications.paymentStatus, refund.priorPaymentStatus),
          )).returning({ id: tournamentApplications.applicationId });
        const [payment] = await tx.update(paymentRecords)
          .set({ status: refund.paymentStatus, updatedAt: new Date(refund.updatedAt) })
          .where(and(
            eq(paymentRecords.paymentRecordId, refund.paymentRecordId),
            eq(paymentRecords.status, refund.priorPaymentStatus),
          )).returning({ id: paymentRecords.paymentRecordId });
        if (!application || !payment) {
          throw new RefundServiceError('REFUND_INVALID_TRANSITION', 409);
        }
        await tx.insert(refundHistory).values(historyValues(refund.refundRequestId, history));
      });
    } catch (error) {
      if (
        error instanceof RefundServiceError
        || (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
      ) {
        throw new RefundServiceError('REFUND_INVALID_TRANSITION', 409);
      }
      throw error;
    }
    return (await databaseStore.findById(refund.refundRequestId))!;
  },
  async transition(input) {
    await db.transaction(async (tx) => {
      const [changed] = await tx.update(refundRequests)
        .set(storedRefundUpdate(input.refund))
        .where(and(
          eq(refundRequests.refundRequestId, input.refund.refundRequestId),
          eq(refundRequests.status, input.expectedStatus),
        )).returning({ id: refundRequests.refundRequestId });
      if (!changed) throw new RefundServiceError('ADMIN_REFUND_INVALID_TRANSITION', 409);
      const [application] = await tx.update(tournamentApplications)
        .set({ status: input.applicationStatus, paymentStatus: input.paymentStatus })
        .where(and(
          eq(tournamentApplications.applicationId, input.refund.applicationId),
          eq(tournamentApplications.status, input.expectedApplicationStatus),
          eq(tournamentApplications.paymentStatus, input.expectedPaymentStatus),
        ))
        .returning({ id: tournamentApplications.applicationId });
      const [payment] = await tx.update(paymentRecords)
        .set({ status: input.paymentStatus, updatedAt: new Date(input.refund.updatedAt) })
        .where(and(
          eq(paymentRecords.paymentRecordId, input.refund.paymentRecordId),
          eq(paymentRecords.status, input.expectedPaymentStatus),
        ))
        .returning({ id: paymentRecords.paymentRecordId });
      if (!application || !payment) {
        throw new RefundServiceError('ADMIN_REFUND_INVALID_TRANSITION', 409);
      }
      await tx.insert(refundHistory).values(
        historyValues(input.refund.refundRequestId, input.history),
      );
      if (input.insertTransaction) {
        await tx.insert(refundTransactions).values(transactionValues(input.insertTransaction));
      }
      if (input.updateTransaction) {
        const [transaction] = await tx.update(refundTransactions)
          .set(transactionUpdate(input.updateTransaction))
          .where(and(
            eq(
              refundTransactions.refundTransactionId,
              input.updateTransaction.refundTransactionId,
            ),
            eq(refundTransactions.refundRequestId, input.refund.refundRequestId),
            eq(refundTransactions.status, 'mockPending'),
          ))
          .returning({ id: refundTransactions.refundTransactionId });
        if (!transaction) {
          throw new RefundServiceError('ADMIN_REFUND_INVALID_TRANSITION', 409);
        }
      }
    });
    return (await databaseStore.findById(input.refund.refundRequestId))!;
  },
};

async function readDatabaseState(
  row: typeof refundRequests.$inferSelect,
): Promise<StoredState> {
  const [context, historyRows, transactionRows] = await Promise.all([
    databaseStore.findContext(row.paymentRecordId),
    db.select().from(refundHistory)
      .where(eq(refundHistory.refundRequestId, row.refundRequestId))
      .orderBy(asc(refundHistory.createdAt)),
    db.select().from(refundTransactions)
      .where(eq(refundTransactions.refundRequestId, row.refundRequestId))
      .orderBy(desc(refundTransactions.createdAt)),
  ]);
  if (!context) throw new RefundServiceError('PAYMENT_RECORD_NOT_FOUND', 404);
  const refund = parseStoredRefund(row);
  refund.tournamentId = context.tournamentId;
  refund.applicationStatus = context.applicationStatus;
  refund.paymentStatus = context.paymentStatus;
  return {
    context,
    refund,
    history: historyRows.map(parseHistory),
    transactions: transactionRows.reverse().map(parseTransaction),
  };
}

function storedRefundValues(refund: StoredRefund): typeof refundRequests.$inferInsert {
  return {
    refundRequestId: refund.refundRequestId,
    paymentRecordId: refund.paymentRecordId,
    applicationId: refund.applicationId,
    participantId: refund.participantId,
    status: refund.status,
    policyDecision: refund.policyDecision,
    policySnapshot: {
      ...refund.policySnapshot,
      priorApplicationStatus: refund.priorApplicationStatus,
      priorPaymentStatus: refund.priorPaymentStatus,
      tournamentId: refund.tournamentId,
    },
    paidAmountKrw: refund.paidAmountKrw,
    requestedAmountKrw: refund.requestedAmountKrw,
    approvedAmountKrw: refund.approvedAmountKrw,
    currency: refund.currency,
    reason: refund.reason,
    operatorReason: refund.operatorReason,
    requestedAt: new Date(refund.requestedAt),
    updatedAt: new Date(refund.updatedAt),
  };
}

function storedRefundUpdate(refund: StoredRefund) {
  return {
    status: refund.status,
    policyDecision: refund.policyDecision,
    approvedAmountKrw: refund.approvedAmountKrw,
    operatorReason: refund.operatorReason,
    updatedAt: new Date(refund.updatedAt),
  };
}

function historyValues(refundRequestId: string, history: RefundHistoryEntry) {
  return {
    refundHistoryId: history.refundHistoryId,
    refundRequestId,
    event: history.event,
    actorKind: history.actorKind,
    refundStatus: history.refundStatus,
    applicationStatus: history.applicationStatus,
    paymentStatus: history.paymentStatus,
    amountKrw: history.amountKrw,
    currency: history.currency,
    message: history.message,
    createdAt: new Date(history.createdAt),
  };
}

function transactionValues(
  transaction: RefundTransaction & { idempotencyKey: string },
): typeof refundTransactions.$inferInsert {
  return {
    ...transaction,
    createdAt: new Date(transaction.createdAt),
    updatedAt: new Date(transaction.updatedAt),
  };
}

function transactionUpdate(transaction: RefundTransaction) {
  return {
    status: transaction.status,
    providerReference: transaction.providerReference,
    updatedAt: new Date(transaction.updatedAt),
  };
}

const sandboxSeed: RefundPaymentContext = {
  applicationId: 'application-refund-sandbox-1',
  paymentRecordId: 'payment-refund-sandbox-1',
  participantId: 'participant_sandbox_001',
  tournamentId: 'tournament-refund-sandbox-1',
  applicationStatus: 'submitted',
  paymentStatus: 'paid',
  paymentMode: 'card',
  paidAmountKrw: 60000,
  currency: 'KRW',
  recordedAt: '2026-08-01T11:00:00.000Z',
  serviceStartsAt: new Date('2026-08-10T12:00:00.000Z'),
  fullRefundCutoffHours: 168,
  partialRefundCutoffHours: 24,
  partialRefundPercent: 50,
};

let memoryStore = createRefundTestStore(sandboxSeed);
let refundProvider: RefundProviderClient = createMockRefundProviderClient();
let memoryService = createRefundService({
  store: memoryStore,
  provider: refundProvider,
  now: () => new Date('2026-08-01T12:00:00.000Z'),
});

export async function resetRefundState(options: {
  providerBehavior?: 'success' | 'failure';
} = {}) {
  memoryStore = createRefundTestStore(sandboxSeed);
  refundProvider = createMockRefundProviderClient({ behavior: options.providerBehavior });
  memoryService = createRefundService({
    store: memoryStore,
    provider: refundProvider,
    now: () => new Date('2026-08-01T12:00:00.000Z'),
  });
}

export function getRefundService() {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
    ? memoryService
    : createRefundService({
      store: databaseStore,
      provider: createMockRefundProviderClient(),
    });
}
