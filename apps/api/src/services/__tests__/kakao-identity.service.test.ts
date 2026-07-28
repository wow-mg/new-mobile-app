import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ selectResults: [] as unknown[][], inserted: [] as unknown[], failSecondInsert: false }));

vi.mock('../../db/client.js', () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      const select = () => {
        const chain: Record<string, unknown> = {};
        for (const name of ['from', 'innerJoin', 'where', 'limit']) chain[name] = vi.fn(() => chain);
        chain.then = (resolve: (value: unknown) => unknown) => resolve(state.selectResults.shift() ?? []);
        return chain;
      };
      const insert = () => ({ values: vi.fn(async (value: unknown) => {
        state.inserted.push(value);
        if (state.failSecondInsert && state.inserted.length === 2) throw new Error('identity insert failed');
      }) });
      const update = () => ({ set: () => ({ where: vi.fn(async () => undefined) }) });
      return callback({ select, insert, update });
    }),
  },
}));

import { findOrCreateKakaoMember } from '../kakao-identity.service.js';

describe('Kakao identity persistence service', () => {
  beforeEach(() => {
    state.selectResults = [];
    state.inserted = [];
    state.failSecondInsert = false;
  });

  it('creates member and social identity in one transaction and normalizes phone', async () => {
    state.selectResults = [[], []];
    const result = await findOrCreateKakaoMember({ kakaoUserId: 'provider-1', email: ' Member@Example.Invalid ', phone: '+82 10-1234-5678', displayName: '회원' });

    expect(result).toMatchObject({ action: 'signup', member: { email: 'member@example.invalid', phone: '01012345678' } });
    expect(state.inserted).toHaveLength(2);
    expect(state.inserted[0]).toMatchObject({ email: 'member@example.invalid', phone: '01012345678' });
    expect(state.inserted[1]).toMatchObject({ provider: 'kakao', providerUserId: 'provider-1' });
  });

  it('propagates identity insert failure so the transaction cannot produce a session', async () => {
    state.selectResults = [[], []];
    state.failSecondInsert = true;
    await expect(findOrCreateKakaoMember({ kakaoUserId: 'provider-2', email: 'member@example.invalid', displayName: '회원' })).rejects.toThrow('identity insert failed');
    expect(state.inserted).toHaveLength(2);
  });

  it('rejects a normalized duplicate phone before inserting', async () => {
    state.selectResults = [[], [{ email: null, phone: '01012345678' }]];
    await expect(findOrCreateKakaoMember({ kakaoUserId: 'provider-3', email: 'other@example.invalid', phone: '010-1234-5678', displayName: '회원' }))
      .resolves.toMatchObject({ action: 'blocked', reason: 'DUPLICATE_PHONE' });
    expect(state.inserted).toHaveLength(0);
  });
});
