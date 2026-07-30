import { createHash } from 'node:crypto';
import type { ProviderPaymentResult } from './payment-provider.client.js';

type InicisFields = Record<string, string | undefined>;

export function createInicisChkFake(input: {
  amount: number;
  orderId: string;
  timestamp: string;
  hashKey: string;
}) {
  return createHash('sha512')
    .update(`${input.amount}${input.orderId}${input.timestamp}${input.hashKey}`)
    .digest('base64');
}

export function buildInicisAuthPayload(input: {
  merchantId: string;
  orderId: string;
  payType: string;
  idcCode: string;
  amount: number;
  goodsName: string;
  buyerName: string;
  nextUrl: string;
  notificationUrl: string;
  closeUrl: string;
  timestamp: string;
  hashKey: string;
}): Record<string, string> {
  return {
    P_MID: input.merchantId,
    P_OID: input.orderId,
    P_PAY_TYPE: input.payType,
    P_DEVICE_TYPE: 'WEB',
    P_IDCCODE: input.idcCode,
    P_AMT: String(input.amount),
    P_GOODS: input.goodsName,
    P_UNAME: input.buyerName,
    P_NEXT_URL: input.nextUrl,
    P_NOTI_URL: input.notificationUrl,
    P_CLOSE_URL: input.closeUrl,
    P_CHARSET: 'UTF-8',
    P_NOTI: '',
    P_TIMESTAMP: input.timestamp,
    P_CHKFAKE: createInicisChkFake(input),
    P_RESERVED: '',
  };
}

export function assertSuccessfulInicisAuthCallback(fields: InicisFields) {
  if (fields.P_STATUS !== '00') throw new Error('INICIS_AUTH_FAILED');
}

export function buildInicisApprovalRequest(input: {
  idcCode: string;
  merchantId: string;
  authTid: string;
  amount: number;
}) {
  if (!/^[a-z]{2}$/i.test(input.idcCode)) throw new Error('INICIS_INVALID_IDC_CODE');
  const body = new URLSearchParams({
    P_MID: input.merchantId,
    P_AUTH_TID: input.authTid,
    P_AMT: String(input.amount),
    P_CHARSET: 'UTF-8',
  });

  return {
    url: `https://${input.idcCode.toLowerCase()}paypro.inicis.com/payment/v1/rest/payAppl.ini`,
    body: body.toString(),
  };
}

export function mapInicisApprovalResponse(fields: InicisFields): ProviderPaymentResult {
  if (fields.P_STATUS !== '00') throw new Error('INICIS_APPROVAL_FAILED');
  if (!fields.P_TID || !fields.P_OID) throw new Error('INICIS_INVALID_APPROVAL_RESPONSE');

  return {
    providerPaymentId: fields.P_TID,
    providerOrderId: fields.P_OID,
    providerStatus: 'paid',
    auditMetadata: {
      provider: 'kg_inicis',
      approvalStatus: fields.P_STATUS,
    },
    rawResponseMetadata: Object.fromEntries(
      Object.entries(fields).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  };
}
