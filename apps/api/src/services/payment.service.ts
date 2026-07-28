import { eq } from 'drizzle-orm';
import {
  createPaymentOrderRequestSchema,
  paymentOrderResponseSchema,
  reconcilePaymentRequestSchema,
  type CreatePaymentOrderRequest,
  type PaymentApiErrorCode,
  type PaymentMode,
  type PaymentOrderResponse,
  type PaymentProviderStatus,
  type PaymentStatus,
  type ReconcilePaymentRequest,
} from '@template/contracts';
import { db } from '../db/client.js';
import { paymentRecords } from '../db/schema.js';
import { Env } from '../env.js';
import { getPaymentApplicationContext, ParticipantMvpError } from './participant-mvp.service.js';
import {
  createHttpPaymentProviderClient,
  createSandboxPaymentProviderClient,
  type PaymentProviderClient,
  type ProviderPaymentResult,
} from './payment-provider.client.js';

export type PaymentApplication = {
  applicationId: string;
  participantId: string;
  amount: number;
  currency: 'KRW';
};

type StoredPaymentRecord = PaymentOrderResponse & {
  participantId: string;
  idempotencyKey: string;
  providerAuditMetadata: Record<string, unknown>;
  providerRawResponseMetadata: Record<string, unknown>;
};

export interface PaymentRecordStore {
  findByIdempotencyKey(key: string): Promise<StoredPaymentRecord | undefined>;
  findByPaymentRecordId(id: string): Promise<StoredPaymentRecord | undefined>;
  insert(record: StoredPaymentRecord): Promise<StoredPaymentRecord>;
  update(record: StoredPaymentRecord): Promise<StoredPaymentRecord>;
  clear?(): Promise<void>;
}

export class PaymentServiceError extends Error {
  constructor(
    public readonly code: PaymentApiErrorCode,
    public readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(code);
  }
}

const providerToApplicationStatus: Record<PaymentProviderStatus, Extract<PaymentStatus, 'orderCreated' | 'pendingProvider' | 'paid' | 'failed' | 'cancelled' | 'refunded'>> = {
  created: 'orderCreated',
  pending: 'pendingProvider',
  paid: 'paid',
  failed: 'failed',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

const allowedTransitions: Record<string, PaymentStatus[]> = {
  orderCreated: ['orderCreated', 'pendingProvider', 'paid', 'failed', 'cancelled'],
  pendingProvider: ['pendingProvider', 'paid', 'failed', 'cancelled'],
  paid: ['paid', 'refunded'],
  failed: ['failed'],
  cancelled: ['cancelled'],
  refunded: ['refunded'],
};

function publicPayment(record: StoredPaymentRecord) {
  return paymentOrderResponseSchema.parse({
    paymentRecordId: record.paymentRecordId,
    applicationId: record.applicationId,
    paymentMode: record.paymentMode,
    status: record.status,
    providerPaymentId: record.providerPaymentId,
    providerOrderId: record.providerOrderId,
    providerStatus: record.providerStatus,
    amount: record.amount,
    currency: record.currency,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    reconciledAt: record.reconciledAt,
  });
}

function sameCreateRequest(record: StoredPaymentRecord, input: CreatePaymentOrderRequest) {
  return record.applicationId === input.applicationId
    && record.paymentMode === input.paymentMode
    && record.amount === input.amount
    && record.currency === input.currency;
}

function assertApplication(application: PaymentApplication | undefined, participantId: string, amount: number, currency: 'KRW') {
  if (!application) throw new PaymentServiceError('PAYMENT_APPLICATION_NOT_FOUND', 404);
  if (application.participantId !== participantId) {
    throw new PaymentServiceError('PAYMENT_APPLICATION_OWNERSHIP_MISMATCH', 403);
  }
  if (application.amount !== amount || application.currency !== currency) {
    throw new PaymentServiceError('PAYMENT_AMOUNT_MISMATCH', 400);
  }
}

function applyProviderResult(record: StoredPaymentRecord, result: ProviderPaymentResult, now: Date) {
  const nextStatus = providerToApplicationStatus[result.providerStatus];
  if (!allowedTransitions[record.status]?.includes(nextStatus)) {
    throw new PaymentServiceError('PAYMENT_INVALID_TRANSITION', 409);
  }
  return {
    ...record,
    status: nextStatus,
    providerPaymentId: result.providerPaymentId,
    providerOrderId: result.providerOrderId,
    providerStatus: result.providerStatus,
    providerAuditMetadata: result.auditMetadata,
    providerRawResponseMetadata: result.rawResponseMetadata,
    updatedAt: now.toISOString(),
    reconciledAt: now.toISOString(),
  } satisfies StoredPaymentRecord;
}

export function createPaymentService(dependencies: {
  store: PaymentRecordStore;
  providerClient: PaymentProviderClient;
  findApplication: (applicationId: string) => Promise<PaymentApplication | undefined>;
  now?: () => Date;
  createId?: () => string;
}) {
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? (() => `payment-${crypto.randomUUID()}`);

  const createOrderWithResult = async (participantId: string, unknownInput: unknown) => {
    const input = createPaymentOrderRequestSchema.parse(unknownInput);
    const existing = await dependencies.store.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (existing.participantId !== participantId || !sameCreateRequest(existing, input)) {
        throw new PaymentServiceError('PAYMENT_IDEMPOTENCY_CONFLICT', 409);
      }
      return { payment: publicPayment(existing), replayed: true };
    }

    const application = await dependencies.findApplication(input.applicationId);
    assertApplication(application, participantId, input.amount, input.currency);
    const timestamp = now();
    let record: StoredPaymentRecord = {
      paymentRecordId: createId(),
      applicationId: input.applicationId,
      participantId,
      paymentMode: input.paymentMode,
      status: 'orderCreated',
      amount: input.amount,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      providerAuditMetadata: {},
      providerRawResponseMetadata: {},
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    };
    record = await dependencies.store.insert(record);

    try {
      const result = await dependencies.providerClient.createOrder({
        applicationId: input.applicationId,
        paymentRecordId: record.paymentRecordId,
        paymentMode: input.paymentMode,
        amount: input.amount,
        currency: input.currency,
      });
      record = await dependencies.store.update(applyProviderResult(record, result, now()));
    } catch (error) {
      if (error instanceof PaymentServiceError) throw error;
      throw new PaymentServiceError('PAYMENT_PROVIDER_UNAVAILABLE', 503);
    }
    return { payment: publicPayment(record), replayed: false };
  };

  return {
    createOrderWithResult,
    async createOrder(participantId: string, input: unknown) {
      return (await createOrderWithResult(participantId, input)).payment;
    },
    async readStatus(participantId: string, paymentRecordId: string) {
      const record = await dependencies.store.findByPaymentRecordId(paymentRecordId);
      if (!record) throw new PaymentServiceError('PAYMENT_RECORD_NOT_FOUND', 404);
      if (record.participantId !== participantId) {
        throw new PaymentServiceError('PAYMENT_APPLICATION_OWNERSHIP_MISMATCH', 403);
      }
      return publicPayment(record);
    },
    async reconcile(participantId: string, paymentRecordId: string, unknownInput: unknown) {
      const input = reconcilePaymentRequestSchema.parse(unknownInput);
      const record = await dependencies.store.findByPaymentRecordId(paymentRecordId);
      if (!record) throw new PaymentServiceError('PAYMENT_RECORD_NOT_FOUND', 404);
      if (record.applicationId !== input.applicationId || record.participantId !== participantId) {
        throw new PaymentServiceError('PAYMENT_APPLICATION_OWNERSHIP_MISMATCH', 403);
      }
      const application = await dependencies.findApplication(input.applicationId);
      assertApplication(application, participantId, input.amount, input.currency);
      if (record.amount !== input.amount || record.currency !== input.currency) {
        throw new PaymentServiceError('PAYMENT_AMOUNT_MISMATCH', 400);
      }
      if (!record.providerPaymentId || !record.providerOrderId) {
        throw new PaymentServiceError('PAYMENT_INVALID_TRANSITION', 409);
      }
      try {
        const result = await dependencies.providerClient.getPaymentStatus({
          providerPaymentId: record.providerPaymentId,
          providerOrderId: record.providerOrderId,
        });
        return publicPayment(await dependencies.store.update(applyProviderResult(record, result, now())));
      } catch (error) {
        if (error instanceof PaymentServiceError) throw error;
        throw new PaymentServiceError('PAYMENT_PROVIDER_UNAVAILABLE', 503);
      }
    },
  };
}

const memoryRecords = new Map<string, StoredPaymentRecord>();
const memoryStore: PaymentRecordStore = {
  async findByIdempotencyKey(key) {
    return [...memoryRecords.values()].find((record) => record.idempotencyKey === key);
  },
  async findByPaymentRecordId(id) {
    return memoryRecords.get(id);
  },
  async insert(record) {
    memoryRecords.set(record.paymentRecordId, record);
    return record;
  },
  async update(record) {
    memoryRecords.set(record.paymentRecordId, record);
    return record;
  },
  async clear() {
    memoryRecords.clear();
  },
};

function parseStoredRow(row: typeof paymentRecords.$inferSelect): StoredPaymentRecord {
  return {
    paymentRecordId: row.paymentRecordId,
    applicationId: row.applicationId,
    participantId: row.participantId,
    paymentMode: row.paymentMode as Extract<PaymentMode, 'card' | 'simplePay'>,
    status: row.status as StoredPaymentRecord['status'],
    providerPaymentId: row.providerPaymentId ?? undefined,
    providerOrderId: row.providerOrderId ?? undefined,
    providerStatus: row.providerStatus as PaymentProviderStatus | undefined,
    amount: row.amount ?? row.amountKrw,
    currency: row.currency === 'KRW' ? 'KRW' : 'KRW',
    idempotencyKey: row.idempotencyKey ?? '',
    providerAuditMetadata: (row.providerAuditMetadata as Record<string, unknown> | null) ?? {},
    providerRawResponseMetadata: (row.providerRawResponseMetadata as Record<string, unknown> | null) ?? {},
    createdAt: (row.providerCreatedAt ?? row.recordedAt).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reconciledAt: row.reconciledAt?.toISOString(),
  };
}

const databaseStore: PaymentRecordStore = {
  async findByIdempotencyKey(key) {
    const [row] = await db.select().from(paymentRecords).where(eq(paymentRecords.idempotencyKey, key)).limit(1);
    return row ? parseStoredRow(row) : undefined;
  },
  async findByPaymentRecordId(id) {
    const [row] = await db.select().from(paymentRecords).where(eq(paymentRecords.paymentRecordId, id)).limit(1);
    return row ? parseStoredRow(row) : undefined;
  },
  async insert(record) {
    const [row] = await db.insert(paymentRecords).values({
      paymentRecordId: record.paymentRecordId,
      applicationId: record.applicationId,
      participantId: record.participantId,
      amountKrw: record.amount,
      paymentMode: record.paymentMode,
      status: record.status,
      amount: record.amount,
      currency: record.currency,
      idempotencyKey: record.idempotencyKey,
      providerAuditMetadata: record.providerAuditMetadata,
      providerRawResponseMetadata: record.providerRawResponseMetadata,
      providerCreatedAt: new Date(record.createdAt),
      recordedAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    }).returning();
    return parseStoredRow(row);
  },
  async update(record) {
    const [row] = await db.update(paymentRecords).set({
      status: record.status,
      providerPaymentId: record.providerPaymentId,
      providerOrderId: record.providerOrderId,
      providerStatus: record.providerStatus,
      providerAuditMetadata: record.providerAuditMetadata,
      providerRawResponseMetadata: record.providerRawResponseMetadata,
      reconciledAt: record.reconciledAt ? new Date(record.reconciledAt) : undefined,
      updatedAt: new Date(record.updatedAt),
    }).where(eq(paymentRecords.paymentRecordId, record.paymentRecordId)).returning();
    return parseStoredRow(row);
  },
};

const useMemoryStore = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

function runtimeProviderClient() {
  if (useMemoryStore) return createSandboxPaymentProviderClient();
  if (!Env.PAYMENT_PROVIDER_ENV) throw new PaymentServiceError('PAYMENT_SANDBOX_ONLY', 503);
  if (!Env.PAYMENT_PROVIDER_BASE_URL || !Env.PAYMENT_PROVIDER_MERCHANT_ID || !Env.PAYMENT_PROVIDER_SECRET) {
    throw new PaymentServiceError('PAYMENT_PROVIDER_UNAVAILABLE', 503);
  }
  return createHttpPaymentProviderClient({
    environment: Env.PAYMENT_PROVIDER_ENV,
    baseUrl: Env.PAYMENT_PROVIDER_BASE_URL,
    merchantId: Env.PAYMENT_PROVIDER_MERCHANT_ID,
    secret: Env.PAYMENT_PROVIDER_SECRET,
  });
}

let defaultService: ReturnType<typeof createPaymentService> | undefined;
export function getPaymentService() {
  defaultService ??= createPaymentService({
    store: useMemoryStore ? memoryStore : databaseStore,
    providerClient: runtimeProviderClient(),
    findApplication: async (id) => {
      try {
        return await getPaymentApplicationContext(id);
      } catch (error) {
        if (error instanceof ParticipantMvpError) return undefined;
        throw error;
      }
    },
  });
  return defaultService;
}

export async function resetPaymentState() {
  await memoryStore.clear?.();
  defaultService = undefined;
}
