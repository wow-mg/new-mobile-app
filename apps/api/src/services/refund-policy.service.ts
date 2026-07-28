import type { RefundPolicyDecision } from '@template/contracts';

type RefundPolicyOverride = {
  decision: 'operatorOverride';
  amountKrw: number;
  reason: string;
};

export type RefundPolicyInput = {
  paidAmountKrw: number;
  requestedAt: Date;
  serviceStartsAt: Date;
  fullRefundCutoffHours?: number;
  partialRefundCutoffHours?: number;
  partialRefundPercent?: number;
  override?: RefundPolicyOverride;
};

export class RefundPolicyError extends Error {
  constructor() {
    super('REFUND_POLICY_UNAVAILABLE');
  }
}

function isNonnegativeInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function evaluateRefundPolicy(input: RefundPolicyInput): {
  decision: RefundPolicyDecision;
  amountKrw: number;
} {
  if (
    !isNonnegativeInteger(input.paidAmountKrw)
    || Number.isNaN(input.requestedAt.getTime())
    || Number.isNaN(input.serviceStartsAt.getTime())
  ) {
    throw new RefundPolicyError();
  }

  if (input.override) {
    if (
      input.override.decision !== 'operatorOverride'
      || !input.override.reason.trim()
      || !isNonnegativeInteger(input.override.amountKrw)
      || input.override.amountKrw > input.paidAmountKrw
    ) {
      throw new RefundPolicyError();
    }
    return { decision: 'operatorOverride', amountKrw: input.override.amountKrw };
  }

  if (
    !isNonnegativeInteger(input.fullRefundCutoffHours)
    || !isNonnegativeInteger(input.partialRefundCutoffHours)
    || input.fullRefundCutoffHours < input.partialRefundCutoffHours
    || !isNonnegativeInteger(input.partialRefundPercent)
    || input.partialRefundPercent > 100
  ) {
    throw new RefundPolicyError();
  }

  const hoursUntilService = (input.serviceStartsAt.getTime() - input.requestedAt.getTime()) / 3_600_000;
  if (hoursUntilService >= input.fullRefundCutoffHours) {
    return { decision: 'fullRefund', amountKrw: input.paidAmountKrw };
  }
  if (hoursUntilService >= input.partialRefundCutoffHours) {
    return {
      decision: 'partialRefund',
      amountKrw: Math.floor(input.paidAmountKrw * input.partialRefundPercent / 100),
    };
  }
  return { decision: 'noRefund', amountKrw: 0 };
}
