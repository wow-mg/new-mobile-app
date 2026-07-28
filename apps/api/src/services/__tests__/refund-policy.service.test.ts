import { describe, expect, it } from 'vitest';
import {
  RefundPolicyError,
  evaluateRefundPolicy,
} from '../refund-policy.service.js';

const base = {
  paidAmountKrw: 60000,
  serviceStartsAt: new Date('2026-08-10T12:00:00.000Z'),
  fullRefundCutoffHours: 168,
  partialRefundCutoffHours: 24,
  partialRefundPercent: 50,
};

describe('refund policy evaluator', () => {
  it.each([
    ['2026-08-01T12:00:00.000Z', 'fullRefund', 60000],
    ['2026-08-05T12:00:00.000Z', 'partialRefund', 30000],
    ['2026-08-10T00:00:00.000Z', 'noRefund', 0],
  ])('evaluates cutoff tier at %s', (requestedAt, decision, amountKrw) => {
    expect(evaluateRefundPolicy({
      ...base,
      requestedAt: new Date(requestedAt),
    })).toEqual({
      decision,
      amountKrw,
    });
  });

  it('uses a bounded, reasoned operator override', () => {
    expect(evaluateRefundPolicy({
      ...base,
      requestedAt: new Date('2026-08-10T00:00:00.000Z'),
      override: {
        decision: 'operatorOverride',
        amountKrw: 15000,
        reason: 'Operator documented exception',
      },
    })).toEqual({
      decision: 'operatorOverride',
      amountKrw: 15000,
    });
    expect(() => evaluateRefundPolicy({
      ...base,
      requestedAt: new Date('2026-08-10T00:00:00.000Z'),
      override: {
        decision: 'operatorOverride',
        amountKrw: 60001,
        reason: 'Invalid amount',
      },
    })).toThrow(RefundPolicyError);
  });

  it('fails closed for missing or reversed server policy', () => {
    expect(() => evaluateRefundPolicy({
      ...base,
      requestedAt: new Date('2026-08-01T12:00:00.000Z'),
      partialRefundCutoffHours: 240,
    })).toThrow(RefundPolicyError);
    expect(() => evaluateRefundPolicy({
      ...base,
      requestedAt: new Date('2026-08-01T12:00:00.000Z'),
      partialRefundPercent: undefined,
    })).toThrow(RefundPolicyError);
  });
});
