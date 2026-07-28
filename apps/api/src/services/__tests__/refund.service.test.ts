import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRefundService,
  createRefundTestStore,
  RefundServiceError,
} from '../refund.service.js';
import { createMockRefundProviderClient } from '../refund-provider.client.js';

describe('refund service state synchronization', () => {
  const now = () => new Date('2026-08-01T12:00:00.000Z');

  function setup(
    seedOverrides: Partial<Parameters<typeof createRefundTestStore>[0]> = {},
    provider = createMockRefundProviderClient(),
  ) {
    vi.spyOn(provider, 'requestRefund');
    const store = createRefundTestStore({
      applicationId: 'application-1',
      paymentRecordId: 'payment-1',
      participantId: 'participant-1',
      tournamentId: 'tournament-1',
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
      ...seedOverrides,
    });
    return {
      store,
      provider,
      service: createRefundService({
        store,
        provider,
        now,
        createId: vi.fn()
          .mockReturnValueOnce('refund-1')
          .mockReturnValueOnce('history-requested')
          .mockReturnValueOnce('history-approved')
          .mockReturnValueOnce('transaction-1')
          .mockReturnValueOnce('history-provider-requested')
          .mockReturnValueOnce('history-provider-succeeded'),
      }),
    };
  }

  beforeEach(() => vi.restoreAllMocks());

  it('requests, approves, mocks provider refund, and synchronizes all statuses/history', async () => {
    const { service, store, provider } = setup();
    const requested = await service.requestRefund('participant-1', 'payment-1', {
      reason: 'Schedule conflict',
    });
    expect(requested).toMatchObject({
      status: 'operatorReview',
      policyDecision: 'fullRefund',
      requestedAmountKrw: 60000,
    });
    expect(store.inspect()).toMatchObject({
      applicationStatus: 'cancellationRequested',
      paymentStatus: 'refundRequested',
    });

    const approved = await service.approveRefund('refund-1', {});
    expect(approved.refundRequest).toMatchObject({
      status: 'approved',
      approvedAmountKrw: 60000,
    });
    expect(store.inspect()).toMatchObject({
      applicationStatus: 'cancellationApproved',
      paymentStatus: 'refundApproved',
    });

    const completed = await service.requestProviderRefund('refund-1', {
      idempotencyKey: 'refund-provider-request-1',
    });
    expect(completed.refundRequest).toMatchObject({ status: 'refunded' });
    expect(completed.latestTransaction).toMatchObject({
      providerKind: 'sandboxMock',
      status: 'mockSucceeded',
      amountKrw: 60000,
    });
    expect(store.inspect()).toMatchObject({
      applicationStatus: 'cancelled',
      paymentStatus: 'refunded',
      durableAuditEvents: 4,
    });
    expect(completed.refundRequest.history.map((entry) => entry.event)).toEqual([
      'requested',
      'approved',
      'providerRequested',
      'providerSucceeded',
    ]);

    const replay = await service.requestProviderRefund('refund-1', {
      idempotencyKey: 'refund-provider-request-1',
    });
    expect(replay).toEqual(completed);
    expect(provider.requestRefund).toHaveBeenCalledTimes(1);
    await expect(service.requestProviderRefund('refund-1', {
      idempotencyKey: 'refund-provider-request-changed',
    })).rejects.toMatchObject({
      code: 'ADMIN_REFUND_INVALID_TRANSITION',
      status: 409,
    });
  });

  it('rejects a request and restores the paid/submitted state', async () => {
    const { service, store } = setup();
    await service.requestRefund('participant-1', 'payment-1', { reason: 'Changed plans' });
    const rejected = await service.rejectRefund('refund-1', {
      reason: 'Outside operator exception policy',
    });
    expect(rejected.refundRequest.status).toBe('rejected');
    expect(store.inspect()).toMatchObject({
      applicationStatus: 'submitted',
      paymentStatus: 'paid',
    });
  });

  it('fails closed for ownership, duplicate requests, stale decisions, and override bounds', async () => {
    const { service } = setup();
    await expect(service.requestRefund('participant-2', 'payment-1', { reason: 'not owner' }))
      .rejects.toMatchObject({ code: 'PAYMENT_APPLICATION_OWNERSHIP_MISMATCH', status: 403 });
    await service.requestRefund('participant-1', 'payment-1', { reason: 'first' });
    await expect(service.requestRefund('participant-1', 'payment-1', { reason: 'second' }))
      .rejects.toMatchObject({ code: 'REFUND_INVALID_TRANSITION', status: 409 });
    await expect(service.approveRefund('refund-1', {
      override: {
        decision: 'operatorOverride',
        amountKrw: 60001,
        reason: 'too much',
      },
    })).rejects.toMatchObject({ code: 'ADMIN_REFUND_OVERRIDE_INVALID', status: 400 });
    await service.rejectRefund('refund-1', { reason: 'rejected' });
    await expect(service.approveRefund('refund-1', {}))
      .rejects.toMatchObject({ code: 'ADMIN_REFUND_INVALID_TRANSITION', status: 409 });
  });

  it('fails closed when authoritative policy is unavailable', async () => {
    const { service } = setup({ partialRefundPercent: undefined });
    await expect(service.requestRefund('participant-1', 'payment-1', {
      reason: 'Policy must be server-owned',
    })).rejects.toMatchObject({
      code: 'REFUND_POLICY_UNAVAILABLE',
      status: 409,
    });
  });

  it('persists a synchronized provider failure before returning the mapped error', async () => {
    const failingProvider = {
      requestRefund: vi.fn(async () => {
        throw new Error('mock provider unavailable');
      }),
    };
    const { service, store } = setup({}, failingProvider);
    await service.requestRefund('participant-1', 'payment-1', { reason: 'Schedule conflict' });
    await service.approveRefund('refund-1', {});

    await expect(service.requestProviderRefund('refund-1', {
      idempotencyKey: 'refund-provider-failure-1',
    })).rejects.toMatchObject({
      code: 'ADMIN_REFUND_PROVIDER_UNAVAILABLE',
      status: 503,
    });

    const history = await service.readRefundHistory('participant-1', 'payment-1');
    expect(history.refundRequest).toMatchObject({
      status: 'providerFailed',
      applicationStatus: 'cancellationApproved',
      paymentStatus: 'refundApproved',
    });
    expect(history.refundRequest.history.map((entry) => entry.event)).toEqual([
      'requested',
      'approved',
      'providerRequested',
      'providerFailed',
    ]);
    expect(store.inspect()).toMatchObject({
      applicationStatus: 'cancellationApproved',
      paymentStatus: 'refundApproved',
      durableAuditEvents: 4,
      latestTransactionStatus: 'mockFailed',
    });
  });
});
