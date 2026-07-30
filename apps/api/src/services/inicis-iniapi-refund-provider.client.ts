import { createHash } from 'node:crypto';

const INICIS_INIAPI_FULL_REFUND_URL = 'https://iniapi.inicis.com/v2/pg/refund';
const INICIS_INIAPI_PARTIAL_REFUND_URL =
  'https://iniapi.inicis.com/v2/pg/partialRefund';
const INICIS_INIAPI_JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

type InicisIniapiFields = Record<string, string | undefined>;

type InicisIniapiCommonRefundInput = {
  iniapiKey: string;
  timestamp: string;
  clientIp: string;
  mid: string;
  tid: string;
};

export const INICIS_INIAPI_PRIVATE_VALUE_MARKERS = {
  iniapiKey: '',
  mid: '',
  clientIp: '',
  tid: '',
} as const;

export const INICIS_INIAPI_DEFERRED_UNSUPPORTED = {
  virtualAccountRefund: {
    supported: false,
    requiredPrivateMarker: 'iniapiIv',
    endpoints: {
      full: 'https://iniapi.inicis.com/v2/pg/refund/vacct',
      partial: 'https://iniapi.inicis.com/v2/pg/partialRefund/vacct',
    },
  },
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

function stringifyWithoutBackslashes(value: unknown) {
  return JSON.stringify(value).replace(/\\/g, '');
}

function buildRequest(url: string, body: unknown) {
  return {
    url,
    method: 'POST' as const,
    headers: {
      'content-type': INICIS_INIAPI_JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(body),
  };
}

export function buildInicisIniapiFullRefundRequest(
  input: InicisIniapiCommonRefundInput,
) {
  const type = 'refund';
  const data = { tid: input.tid };
  const hashData = createSha512Hex(
    input.iniapiKey
      + input.mid
      + type
      + input.timestamp
      + stringifyWithoutBackslashes(data),
  );

  return buildRequest(INICIS_INIAPI_FULL_REFUND_URL, {
    mid: input.mid,
    type,
    timestamp: input.timestamp,
    clientIp: input.clientIp,
    data,
    hashData,
  });
}

function isSafeNonNegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertValidPartialAmounts(input: {
  price: number;
  confirmPrice: number;
}) {
  if (
    !Number.isSafeInteger(input.price)
    || input.price <= 0
    || !isSafeNonNegativeInteger(input.confirmPrice)
  ) {
    throw new Error('INICIS_INVALID_PARTIAL_REFUND_AMOUNT');
  }
}

export function buildInicisIniapiPartialRefundRequest(
  input: InicisIniapiCommonRefundInput & {
    price: number;
    confirmPrice: number;
  },
) {
  assertValidPartialAmounts(input);

  const type = 'partialRefund';
  const price = String(input.price);
  const confirmPrice = String(input.confirmPrice);
  const data = {
    tid: input.tid,
    price,
    confirmPrice,
  };
  const hashData = createSha512Hex(
    input.iniapiKey
      + input.mid
      + type
      + input.timestamp
      + stringifyWithoutBackslashes(data),
  );

  return buildRequest(INICIS_INIAPI_PARTIAL_REFUND_URL, {
    mid: input.mid,
    type,
    timestamp: input.timestamp,
    clientIp: input.clientIp,
    data,
    hashData,
  });
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
