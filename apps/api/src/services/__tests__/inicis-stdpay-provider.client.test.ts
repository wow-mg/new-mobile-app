import { describe, expect, it } from 'vitest';
import {
  assertSuccessfulInicisAuthCallback,
  buildInicisApprovalRequest,
  buildInicisAuthPayload,
  createInicisChkFake,
  mapInicisApprovalResponse,
} from '../inicis-stdpay-provider.client.js';

const fixture = {
  merchantId: 'fixture-merchant-id',
  orderId: 'fixture-order-20260730',
  amount: 12500,
  timestamp: '1725000000',
  hashKey: 'fixture-hash-key',
};

describe('KG Inicis StdPay provider adapter', () => {
  it('builds the INIPayPro StdPay auth request fields and checksum', () => {
    const payload = buildInicisAuthPayload({
      ...fixture,
      payType: 'CARD',
      idcCode: 'fc',
      goodsName: 'Fixture goods',
      buyerName: 'Fixture buyer',
      nextUrl: 'https://fixture.invalid/payments/next',
      notificationUrl: 'https://fixture.invalid/payments/notify',
      closeUrl: 'https://fixture.invalid/payments/close',
    });

    expect(payload).toEqual({
      P_MID: fixture.merchantId,
      P_OID: fixture.orderId,
      P_PAY_TYPE: 'CARD',
      P_DEVICE_TYPE: 'WEB',
      P_IDCCODE: 'fc',
      P_AMT: '12500',
      P_GOODS: 'Fixture goods',
      P_UNAME: 'Fixture buyer',
      P_NEXT_URL: 'https://fixture.invalid/payments/next',
      P_NOTI_URL: 'https://fixture.invalid/payments/notify',
      P_CLOSE_URL: 'https://fixture.invalid/payments/close',
      P_CHARSET: 'UTF-8',
      P_NOTI: '',
      P_TIMESTAMP: fixture.timestamp,
      P_CHKFAKE: '5fU9cq8nwU6bbWrz/jzGM3MXcC3onPNPCUGZg6qeWM50J+XQoftVkk1t4y0bafDzlxokGC1wPWMMffyz/yBYLg==',
      P_RESERVED: '',
    });
  });

  it('computes P_CHKFAKE as SHA-512/base64 over amount, order id, timestamp, and hashkey', () => {
    expect(createInicisChkFake(fixture)).toBe(
      '5fU9cq8nwU6bbWrz/jzGM3MXcC3onPNPCUGZg6qeWM50J+XQoftVkk1t4y0bafDzlxokGC1wPWMMffyz/yBYLg==',
    );
  });

  it('fails closed unless the auth callback status is exactly 00', () => {
    expect(() => assertSuccessfulInicisAuthCallback({ P_STATUS: '00' })).not.toThrow();
    expect(() => assertSuccessfulInicisAuthCallback({ P_STATUS: '01' }))
      .toThrowError('INICIS_AUTH_FAILED');
    expect(() => assertSuccessfulInicisAuthCallback({}))
      .toThrowError('INICIS_AUTH_FAILED');
  });

  it('builds the validated approval URL and URL-encoded body', () => {
    const request = buildInicisApprovalRequest({
      idcCode: 'fc',
      merchantId: fixture.merchantId,
      authTid: 'fixture-auth-tid',
      amount: fixture.amount,
    });

    expect(request.url).toBe('https://fcpaypro.inicis.com/payment/v1/rest/payAppl.ini');
    expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
      P_MID: fixture.merchantId,
      P_AUTH_TID: 'fixture-auth-tid',
      P_AMT: '12500',
      P_CHARSET: 'UTF-8',
    });
    expect(() => buildInicisApprovalRequest({
      idcCode: '../',
      merchantId: fixture.merchantId,
      authTid: 'fixture-auth-tid',
      amount: fixture.amount,
    })).toThrowError('INICIS_INVALID_IDC_CODE');
  });

  it('maps a successful mocked approval response to ProviderPaymentResult', () => {
    expect(mapInicisApprovalResponse({
      P_STATUS: '00',
      P_TID: 'fixture-approved-tid',
      P_OID: fixture.orderId,
      P_AMT: '12500',
      P_RMESG1: 'Fixture approval',
    })).toEqual({
      providerPaymentId: 'fixture-approved-tid',
      providerOrderId: fixture.orderId,
      providerStatus: 'paid',
      auditMetadata: {
        provider: 'kg_inicis',
        approvalStatus: '00',
      },
      rawResponseMetadata: {
        P_STATUS: '00',
        P_TID: 'fixture-approved-tid',
        P_OID: fixture.orderId,
        P_AMT: '12500',
        P_RMESG1: 'Fixture approval',
      },
    });
  });

  it('fails closed for unsuccessful or incomplete approval responses', () => {
    expect(() => mapInicisApprovalResponse({
      P_STATUS: '01',
      P_TID: 'fixture-declined-tid',
      P_OID: fixture.orderId,
    })).toThrowError('INICIS_APPROVAL_FAILED');

    expect(() => mapInicisApprovalResponse({
      P_STATUS: '00',
      P_OID: fixture.orderId,
    })).toThrowError('INICIS_INVALID_APPROVAL_RESPONSE');

    expect(() => mapInicisApprovalResponse({
      P_STATUS: '00',
      P_TID: 'fixture-approved-tid',
    })).toThrowError('INICIS_INVALID_APPROVAL_RESPONSE');
  });
});
