import type { PaymentMode, PaymentProviderStatus } from '@template/contracts';

export type ProviderPaymentResult = {
  providerPaymentId: string;
  providerOrderId: string;
  providerStatus: PaymentProviderStatus;
  auditMetadata: Record<string, unknown>;
  rawResponseMetadata: Record<string, unknown>;
};

export interface PaymentProviderClient {
  createOrder(input: {
    applicationId: string;
    paymentRecordId: string;
    paymentMode: Extract<PaymentMode, 'card' | 'simplePay'>;
    amount: number;
    currency: 'KRW';
  }): Promise<ProviderPaymentResult>;
  getPaymentStatus(input: {
    providerPaymentId: string;
    providerOrderId: string;
  }): Promise<ProviderPaymentResult>;
}

type ProviderConfig = {
  environment: 'sandbox' | 'dev-staging';
  baseUrl: string;
  merchantId: string;
  secret: string;
};

function sanitizeProviderResult(value: unknown): ProviderPaymentResult {
  if (!value || typeof value !== 'object') throw new Error('PAYMENT_PROVIDER_UNAVAILABLE');
  const result = value as Record<string, unknown>;
  const providerStatus = result.providerStatus;
  if (
    typeof result.providerPaymentId !== 'string'
    || typeof result.providerOrderId !== 'string'
    || !['created', 'pending', 'paid', 'failed', 'cancelled', 'refunded'].includes(String(providerStatus))
  ) {
    throw new Error('PAYMENT_PROVIDER_UNAVAILABLE');
  }
  return {
    providerPaymentId: result.providerPaymentId,
    providerOrderId: result.providerOrderId,
    providerStatus: providerStatus as PaymentProviderStatus,
    auditMetadata: typeof result.auditMetadata === 'object' && result.auditMetadata ? result.auditMetadata as Record<string, unknown> : {},
    rawResponseMetadata: typeof result.rawResponseMetadata === 'object' && result.rawResponseMetadata ? result.rawResponseMetadata as Record<string, unknown> : {},
  };
}

export function createHttpPaymentProviderClient(config: ProviderConfig, fetchImpl: typeof fetch = fetch): PaymentProviderClient {
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetchImpl(new URL(path, config.baseUrl), {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-payment-merchant': config.merchantId,
        'x-payment-secret': config.secret,
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error('PAYMENT_PROVIDER_UNAVAILABLE');
    return sanitizeProviderResult(await response.json());
  };

  return {
    createOrder: (input) => request('/payments/orders', {
      method: 'POST',
      body: JSON.stringify({ ...input, environment: config.environment }),
    }),
    getPaymentStatus: ({ providerPaymentId, providerOrderId }) =>
      request(`/payments/${encodeURIComponent(providerPaymentId)}?orderId=${encodeURIComponent(providerOrderId)}`),
  };
}

export function createSandboxPaymentProviderClient(): PaymentProviderClient {
  return {
    async createOrder(input) {
      return {
        providerPaymentId: `sandbox-${input.paymentRecordId}`,
        providerOrderId: `sandbox-order-${input.paymentRecordId}`,
        providerStatus: 'pending',
        auditMetadata: { environment: 'sandbox', accepted: true },
        rawResponseMetadata: { result: 'pending' },
      };
    },
    async getPaymentStatus(input) {
      return {
        ...input,
        providerStatus: 'pending',
        auditMetadata: { environment: 'sandbox', reconciled: true },
        rawResponseMetadata: { result: 'pending' },
      };
    },
  };
}
