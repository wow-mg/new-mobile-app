import { describe, expect, it } from 'vitest';
import {
  INICIS_INIAPI_DEFERRED_UNSUPPORTED,
  INICIS_INIAPI_PRIVATE_VALUE_MARKERS,
  buildInicisIniapiFullRefundRequest,
  buildInicisIniapiPartialRefundRequest,
  mapInicisIniapiFullRefundResponse,
  mapInicisIniapiPartialRefundResponse,
} from '../inicis-iniapi-refund-provider.client.js';

const fixture = {
  iniapiKey: 'fixture-iniapi-key',
  timestamp: '20260730133122',
  clientIp: 'fixture-client-ip',
  mid: 'fixture-mid',
  tid: 'fixture-provider-tid',
};

describe('KG Inicis INIAPI refund provider adapter', () => {
  it('marks every required private merchant value without populating it', () => {
    expect(INICIS_INIAPI_PRIVATE_VALUE_MARKERS).toEqual({
      iniapiKey: '',
      mid: '',
      clientIp: '',
      tid: '',
    });
    expect(Object.values(INICIS_INIAPI_PRIVATE_VALUE_MARKERS).every((value) => value === ''))
      .toBe(true);
  });

  it('records virtual-account refund as deferred unsupported metadata', () => {
    expect(INICIS_INIAPI_DEFERRED_UNSUPPORTED).toEqual({
      virtualAccountRefund: {
        supported: false,
        requiredPrivateMarker: 'iniapiIv',
        endpoints: {
          full: 'https://iniapi.inicis.com/v2/pg/refund/vacct',
          partial: 'https://iniapi.inicis.com/v2/pg/partialRefund/vacct',
        },
      },
    });
  });

  it('builds a full refund descriptor with the documented SHA-512 hex hash', () => {
    const request = buildInicisIniapiFullRefundRequest(fixture);

    expect(request).toEqual({
      url: 'https://iniapi.inicis.com/v2/pg/refund',
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: expect.any(String),
    });
    expect(JSON.parse(request.body)).toEqual({
      mid: fixture.mid,
      type: 'refund',
      timestamp: fixture.timestamp,
      clientIp: fixture.clientIp,
      data: { tid: fixture.tid },
      hashData: 'd5882f0bec6d2aa0a0c53ec81f5379cc4d1fd68f2db9f704c5355905322ac99518e98000426e2690ce582377fc911d9d3a3bc9eb89353dadf2e574055f03a656',
    });
  });

  it('removes backslashes only from the full refund hash input', () => {
    const request = buildInicisIniapiFullRefundRequest({
      ...fixture,
      tid: 'fixture-provider\\tid',
    });

    expect(JSON.parse(request.body)).toMatchObject({
      data: { tid: 'fixture-provider\\tid' },
      hashData: '2ae7e0d4e718658c730f856a20d8505e2bf3bf3b3d5b2099b33f8d09202e7b4c69708b83b7191dbe0357ae19aa605c9d547a477a5fe343c3490ddd8f91ba275a',
    });
  });

  it('builds a partial refund descriptor with amount fields and the documented hash', () => {
    const request = buildInicisIniapiPartialRefundRequest({
      ...fixture,
      price: 5000,
      confirmPrice: 7000,
    });

    expect(request.url).toBe('https://iniapi.inicis.com/v2/pg/partialRefund');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({
      'content-type': 'application/json; charset=utf-8',
    });
    expect(JSON.parse(request.body)).toEqual({
      mid: fixture.mid,
      type: 'partialRefund',
      timestamp: fixture.timestamp,
      clientIp: fixture.clientIp,
      data: {
        tid: fixture.tid,
        price: '5000',
        confirmPrice: '7000',
      },
      hashData: '14098b88408bf8b28b4dce1cecb61340508e4e6c493647338f42d31e89120b0ae779d8515a83b776e3e633a9d215ec191403c253669e872e94034d4b85ca8aa1',
    });
  });

  it.each([
    { price: 0, confirmPrice: 7000 },
    { price: -1, confirmPrice: 7000 },
    { price: 1.5, confirmPrice: 7000 },
    { price: Number.MAX_SAFE_INTEGER + 1, confirmPrice: 7000 },
    { price: 5000, confirmPrice: -1 },
    { price: 5000, confirmPrice: 1.5 },
    { price: 5000, confirmPrice: Number.MAX_SAFE_INTEGER + 1 },
  ])('fails closed for invalid partial amounts: %o', ({ price, confirmPrice }) => {
    expect(() => buildInicisIniapiPartialRefundRequest({
      ...fixture,
      price,
      confirmPrice,
    })).toThrowError('INICIS_INVALID_PARTIAL_REFUND_AMOUNT');
  });

  it('maps a complete successful full refund response', () => {
    expect(mapInicisIniapiFullRefundResponse({
      resultCode: '00',
      resultMsg: 'Fixture success',
      cancelDate: '20260730',
      cancelTime: '133501',
    })).toEqual({
      kind: 'full',
      provider: 'kg_inicis',
      resultCode: '00',
      resultMessage: 'Fixture success',
      cancelDate: '20260730',
      cancelTime: '133501',
    });
  });

  it('maps a complete successful partial refund response', () => {
    expect(mapInicisIniapiPartialRefundResponse({
      resultCode: '00',
      resultMsg: 'Fixture partial success',
      prtcDate: '20260730',
      prtcTime: '133601',
      tid: 'fixture-provider-tid',
      prtcTid: 'fixture-partial-tid',
      prtcPrice: '5000',
      prtcRemains: '7000',
    })).toEqual({
      kind: 'partial',
      provider: 'kg_inicis',
      resultCode: '00',
      resultMessage: 'Fixture partial success',
      partialDate: '20260730',
      partialTime: '133601',
      providerTransactionId: 'fixture-provider-tid',
      providerPartialTransactionId: 'fixture-partial-tid',
      refundedAmount: 5000,
      remainingAmount: 7000,
    });
  });

  it.each([
    {},
    { resultCode: '01', cancelDate: '20260730', cancelTime: '133501' },
    { resultCode: '00', cancelTime: '133501' },
    { resultCode: '00', cancelDate: '20260730' },
  ])('fails closed for unsuccessful or incomplete full responses: %o', (response) => {
    expect(() => mapInicisIniapiFullRefundResponse(response))
      .toThrowError(response.resultCode === '00'
        ? 'INICIS_INVALID_FULL_REFUND_RESPONSE'
        : 'INICIS_REFUND_FAILED');
  });

  it.each([
    {},
    { resultCode: '01' },
    {
      resultCode: '00',
      prtcDate: '20260730',
      prtcTime: '133601',
      tid: 'fixture-provider-tid',
      prtcTid: 'fixture-partial-tid',
      prtcPrice: '5000',
    },
    {
      resultCode: '00',
      prtcDate: '20260730',
      prtcTime: '133601',
      tid: 'fixture-provider-tid',
      prtcTid: 'fixture-partial-tid',
      prtcPrice: 'not-an-amount',
      prtcRemains: '7000',
    },
  ])('fails closed for unsuccessful or incomplete partial responses: %o', (response) => {
    expect(() => mapInicisIniapiPartialRefundResponse(response))
      .toThrowError(response.resultCode === '00'
        ? 'INICIS_INVALID_PARTIAL_REFUND_RESPONSE'
        : 'INICIS_REFUND_FAILED');
  });
});
