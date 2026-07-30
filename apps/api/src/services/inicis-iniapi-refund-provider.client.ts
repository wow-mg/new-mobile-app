import { createHash } from 'node:crypto';

const INICIS_INIAPI_REFUND_URL = 'https://iniapi.inicis.com/api/v1/refund';
const INICIS_INIAPI_FORM_CONTENT_TYPE =
  'application/x-www-form-urlencoded;charset=utf-8';

type InicisIniapiFields = Record<string, string | undefined>;

type InicisIniapiCommonRefundInput = {
  iniapiKey: string;
  paymethod: string;
  timestamp: string;
  clientIp: string;
  mid: string;
  tid: string;
  msg: string;
};

export const INICIS_INIAPI_PRIVATE_VALUE_MARKERS = {
  iniapiKey: '',
  mid: '',
  clientIp: '',
  tid: '',
  paymethod: '',
} as const;

export type InicisIniapiRefundResult =
  | {
    kind: 'full';
    provider: 'kg_inicis';
    resultCode: '00';
    resultMessage: string;
    cancelDate: string;
    cancelTime: string;
  }
  | {
    kind: 'partial';
    provider: 'kg_inicis';
    resultCode: '00';
    resultMessage: string;
    partialDate: string;
    partialTime: string;
    providerTransactionId: string;
    providerPartialTransactionId: string;
    refundedAmount: number;
    remainingAmount: number;
  };

function createSha512Hex(value: string) {
  return createHash('sha512').update(value).digest('hex');
}

function buildRequest(body: URLSearchParams) {
  return {
    url: INICIS_INIAPI_REFUND_URL,
    method: 'POST' as const,
    headers: {
      'content-type': INICIS_INIAPI_FORM_CONTENT_TYPE,
    },
    body: body.toString(),
  };
}

export function buildInicisIniapiFullRefundRequest(
  input: InicisIniapiCommonRefundInput,
) {
  const type = 'Refund';
  const hashData = createSha512Hex(
    input.iniapiKey
      + type
      + input.paymethod
      + input.timestamp
      + input.clientIp
      + input.mid
      + input.tid,
  );

  return buildRequest(new URLSearchParams({
    type,
    paymethod: input.paymethod,
    timestamp: input.timestamp,
    clientIp: input.clientIp,
    mid: input.mid,
    tid: input.tid,
    msg: input.msg,
    hashData,
  }));
}

function isSafeNonNegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertValidPartialAmounts(input: {
  price: number;
  confirmPrice: number;
  tax?: number;
  taxFree?: number;
}) {
  if (
    !Number.isSafeInteger(input.price)
    || input.price <= 0
    || !isSafeNonNegativeInteger(input.confirmPrice)
    || (input.tax !== undefined && !isSafeNonNegativeInteger(input.tax))
    || (input.taxFree !== undefined && !isSafeNonNegativeInteger(input.taxFree))
    || (input.tax ?? 0) + (input.taxFree ?? 0) > input.price
  ) {
    throw new Error('INICIS_INVALID_PARTIAL_REFUND_AMOUNT');
  }
}

export function buildInicisIniapiPartialRefundRequest(
  input: InicisIniapiCommonRefundInput & {
    price: number;
    confirmPrice: number;
    currency?: string;
    tax?: number;
    taxFree?: number;
  },
) {
  assertValidPartialAmounts(input);

  const type = 'PartialRefund';
  const price = String(input.price);
  const confirmPrice = String(input.confirmPrice);
  const hashData = createSha512Hex(
    input.iniapiKey
      + type
      + input.paymethod
      + input.timestamp
      + input.clientIp
      + input.mid
      + input.tid
      + price
      + confirmPrice,
  );
  const body = new URLSearchParams({
    type,
    paymethod: input.paymethod,
    timestamp: input.timestamp,
    clientIp: input.clientIp,
    mid: input.mid,
    tid: input.tid,
    msg: input.msg,
    price,
    confirmPrice,
    hashData,
  });

  if (input.currency !== undefined) body.set('currency', input.currency);
  if (input.tax !== undefined) body.set('tax', String(input.tax));
  if (input.taxFree !== undefined) body.set('taxFree', String(input.taxFree));

  return buildRequest(body);
}

function assertSuccessfulRefundResponse(fields: InicisIniapiFields) {
  if (fields.resultCode !== '00') throw new Error('INICIS_REFUND_FAILED');
}

function parseResponseAmount(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

export function mapInicisIniapiFullRefundResponse(
  fields: InicisIniapiFields,
): InicisIniapiRefundResult {
  assertSuccessfulRefundResponse(fields);
  if (!fields.cancelDate || !fields.cancelTime) {
    throw new Error('INICIS_INVALID_FULL_REFUND_RESPONSE');
  }

  return {
    kind: 'full',
    provider: 'kg_inicis',
    resultCode: '00',
    resultMessage: fields.resultMsg ?? '',
    cancelDate: fields.cancelDate,
    cancelTime: fields.cancelTime,
  };
}

export function mapInicisIniapiPartialRefundResponse(
  fields: InicisIniapiFields,
): InicisIniapiRefundResult {
  assertSuccessfulRefundResponse(fields);
  const refundedAmount = parseResponseAmount(fields.prtcPrice);
  const remainingAmount = parseResponseAmount(fields.prtcRemains);

  if (
    !fields.prtcDate
    || !fields.prtcTime
    || !fields.tid
    || !fields.prtcTid
    || refundedAmount === undefined
    || remainingAmount === undefined
  ) {
    throw new Error('INICIS_INVALID_PARTIAL_REFUND_RESPONSE');
  }

  return {
    kind: 'partial',
    provider: 'kg_inicis',
    resultCode: '00',
    resultMessage: fields.resultMsg ?? '',
    partialDate: fields.prtcDate,
    partialTime: fields.prtcTime,
    providerTransactionId: fields.tid,
    providerPartialTransactionId: fields.prtcTid,
    refundedAmount,
    remainingAmount,
  };
}
