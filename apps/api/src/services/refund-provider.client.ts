export type RefundProviderResult = {
  providerReference: string;
  status: 'mockSucceeded';
};

export interface RefundProviderClient {
  requestRefund(input: {
    refundRequestId: string;
    amountKrw: number;
    currency: 'KRW';
    idempotencyKey: string;
  }): Promise<RefundProviderResult>;
}

export function createMockRefundProviderClient(options: {
  behavior?: 'success' | 'failure';
} = {}): RefundProviderClient {
  const requestRefund = async (input: {
    refundRequestId: string;
    amountKrw: number;
    currency: 'KRW';
    idempotencyKey: string;
  }) => {
    if (options.behavior === 'failure') throw new Error('MOCK_REFUND_PROVIDER_UNAVAILABLE');
    return {
      providerReference: `sandbox-refund-${input.refundRequestId}`,
      status: 'mockSucceeded' as const,
    };
  };

  return { requestRefund };
}
