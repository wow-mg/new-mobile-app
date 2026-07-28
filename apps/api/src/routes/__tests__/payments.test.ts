import { beforeEach, describe, expect, it } from 'vitest';
import { paymentApiErrorResponseSchema, paymentOrderResponseSchema } from '@template/contracts';
import { app } from '../../app.js';
import { resetParticipantMvpState, updateParticipantDupr, createTournamentApplication } from '../../services/participant-mvp.service.js';
import { resetPaymentState } from '../../services/payment.service.js';
import { issueParticipantDevSession, resetParticipantDevSessions } from '../../services/participant-session.service.js';

let participantHeaders: Record<string, string>;

describe('sandbox payment endpoints', () => {
  beforeEach(async () => {
    await resetParticipantMvpState();
    await resetPaymentState();
    resetParticipantDevSessions();
    const session = issueParticipantDevSession({
      memberId: 'member-payment-test',
      kakaoUserId: 'kakao-payment-test',
      providerAccessToken: 'provider-test-fixture',
    });
    participantHeaders = { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json' };
    await updateParticipantDupr('DUPR-12345');
    await createTournamentApplication({ tournamentId: 'tournament_sandbox_001' });
  });

  it('rejects server/operator bearer tokens at the participant payment boundary', async () => {
    for (const token of ['test', 'operator-test']) {
      const response = await app.request('/api/payments/orders', {
        method: 'POST',
        headers: { ...participantHeaders, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          applicationId: 'application_tournament_sandbox_001_participant_sandbox_001',
          paymentMode: 'card',
          amount: 60000,
          currency: 'KRW',
          idempotencyKey: `payment-order-${token}`,
        }),
      });
      expect(response.status).toBe(403);
    }
  });

  it('creates, reads, and reconciles a participant-owned sandbox payment order', async () => {
    const create = await app.request('/api/payments/orders', {
      method: 'POST',
      headers: participantHeaders,
      body: JSON.stringify({
        applicationId: 'application_tournament_sandbox_001_participant_sandbox_001',
        paymentMode: 'simplePay',
        amount: 60000,
        currency: 'KRW',
        idempotencyKey: 'route-payment-order-1',
      }),
    });
    expect(create.status).toBe(201);
    const created = paymentOrderResponseSchema.parse(await create.json());

    const read = await app.request(`/api/payments/${created.paymentRecordId}`, {
      headers: participantHeaders,
    });
    expect(read.status).toBe(200);
    expect(paymentOrderResponseSchema.parse(await read.json())).toEqual(created);

    const reconcile = await app.request(`/api/payments/${created.paymentRecordId}/reconcile`, {
      method: 'POST',
      headers: participantHeaders,
      body: JSON.stringify({
        applicationId: created.applicationId,
        amount: created.amount,
        currency: created.currency,
      }),
    });
    expect(reconcile.status).toBe(200);
    expect(paymentOrderResponseSchema.parse(await reconcile.json()).status).toBe('pendingProvider');
  });

  it('returns contract-owned amount errors', async () => {
    const response = await app.request('/api/payments/orders', {
      method: 'POST',
      headers: participantHeaders,
      body: JSON.stringify({
        applicationId: 'application_tournament_sandbox_001_participant_sandbox_001',
        paymentMode: 'card',
        amount: 50000,
        currency: 'KRW',
        idempotencyKey: 'route-payment-order-amount-error',
      }),
    });
    expect(response.status).toBe(400);
    expect(paymentApiErrorResponseSchema.parse(await response.json())).toEqual({
      error: 'PAYMENT_AMOUNT_MISMATCH',
    });
  });
});
