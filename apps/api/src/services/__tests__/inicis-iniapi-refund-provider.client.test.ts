import { describe, expect, it } from 'vitest';
import {
  INICIS_INIAPI_PRIVATE_VALUE_MARKERS,
  buildInicisIniapiFullRefundRequest,
  buildInicisIniapiPartialRefundRequest,
  mapInicisIniapiFullRefundResponse,
  mapInicisIniapiPartialRefundResponse,
} from '../inicis-iniapi-refund-provider.client.js';

const fixture = {
  iniapiKey: 'fixture-iniapi-key',
  paymethod: 'Card',
  timestamp: '20260730133122',
  clientIp: 'fixture-client-ip',
  mid: 'fixture-mid',
  tid: 'fixture-provider-tid',
  msg: 'Fixture refund',
};

describe('KG Inicis INIAPI refund provider adapter', () => {
  it('marks every required private merchant value without populating it', () => {
    expect(INICIS_INIAPI_PRIVATE_VALUE_MARKERS).toEqual({
      iniapiKey: '',
      mid: '',
      clientIp: '',
      tid: '',
      paymethod: '',
    });
    expect(Object.values(INICIS_INIAPI_PRIVATE_VALUE_MARKERS).every((value) => value === ''))
      .toBe(true);
  });

  it('builds a full refund descriptor with the documented SHA-512 hex hash', () => {
    const request = buildInicisIniapiFullRefundRequest(fixture);

    expect(request).toEqual({
      url: 'https://iniapi.inicis.com/api/v1/refund',
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: expect.any(String),
    });
    expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
      type: 'Refund',
      paymethod: fixture.paymethod,
      timestamp: fixture.timestamp,
      clientIp: fixture.clientIp,
      mid: fixture.mid,
      tid: fixture.tid,
      msg: fixture.msg,
      hashData: '15f394ad5c6587794c0d9a47044c89aad454c5948a0e70638c3038fe051bf0884a35cf854d3c0f0b2e410414e7291272956278867bd8a9f69ebaf4db7eca49fe',
    });
  });

  it('builds a partial refund descriptor with amount fields and the documented hash', () => {
    const request = buildInicisIniapiPartialRefundRequest({
      ...fixture,
      price: 5000,
      confirmPrice: 7000,
      currency: 'WON',
      tax: 455,
      taxFree: 0,
    });

    expect(request.url).toBe('https://iniapi.inicis.com/api/v1/refund');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({
      'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
    });
    expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
      type: 'PartialRefund',
      paymethod: fixture.paymethod,
      timestamp: fixture.timestamp,
      clientIp: fixture.clientIp,
      mid: fixture.mid,
      tid: fixture.tid,
      msg: fixture.msg,
      price: '5000',
      confirmPrice: '7000',
      currency: 'WON',
      tax: '455',
      taxFree: '0',
      hashData: '8fb4f8a3a3d8dc3ff8b2595c49b0012100dc9a44c38c39817de28cb89739df75783c570cb32f762026addbbd26777c0545520f7b9fdd20fda6ece2a9ff733fdd',
    });
  });

  it('omits optional partial refund fields when the caller does not provide them', () => {
    const body = new URLSearchParams(buildInicisIniapiPartialRefundRequest({
      ...fixture,
      price: 5000,
      confirmPrice: 7000,
    }).body);

    expect(body.has('currency')).toBe(false);
    expect(body.has('tax')).toBe(false);
    expect(body.has('taxFree')).toBe(false);
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

  it('fails closed when partial tax fields are invalid or inconsistent', () => {
    expect(() => buildInicisIniapiPartialRefundRequest({
      ...fixture,
      price: 5000,
      confirmPrice: 7000,
      tax: -1,
    })).toThrowError('INICIS_INVALID_PARTIAL_REFUND_AMOUNT');

    expect(() => buildInicisIniapiPartialRefundRequest({
      ...fixture,
      price: 5000,
      confirmPrice: 7000,
      tax: 4500,
      taxFree: 1000,
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
