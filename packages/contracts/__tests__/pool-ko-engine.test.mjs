import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWithdrawal,
  assignPools,
  generateKoBracket,
  generateRoundRobin,
  mapQualifiersToKo,
  rankPool,
} from '../dist/index.js';

const entrants = (count) => Array.from({ length: count }, (_, index) => ({
  entrantId: `entrant-${index + 1}`,
  teamId: `team-${index + 1}`,
  seed: index + 1,
  originalDivisionId: 'division-original',
  mergedIntoDivisionId: 'division-open',
  withdrawalStatus: 'active',
}));

test('assignPools covers every N=3..64 with only preferred valid pool sizes', () => {
  const expectedExamples = new Map([
    [3, [3]], [4, [4]], [5, [5]], [6, [3, 3]], [7, [4, 3]],
    [8, [4, 4]], [9, [3, 3, 3]], [10, [4, 3, 3]],
    [11, [4, 4, 3]], [12, [4, 4, 4]], [13, [4, 3, 3, 3]],
    [14, [4, 4, 3, 3]], [15, [4, 4, 4, 3]], [16, [4, 4, 4, 4]],
  ]);

  for (let count = 3; count <= 64; count += 1) {
    const result = assignPools({ divisionId: 'division-open', entrants: entrants(count) });
    assert.equal(result.ok, true, `N=${count}`);
    const sizes = result.pools.map((pool) => pool.entrantIds.length);
    assert.equal(sizes.reduce((sum, size) => sum + size, 0), count);
    assert.equal(sizes.every((size) => size === 3 || size === 4 || size === 5), true);
    assert.equal(sizes.includes(2), false);
    if (expectedExamples.has(count)) assert.deepEqual(sizes, expectedExamples.get(count));
  }
});

test('assignPools rejects N<3 without silently cancelling a division', () => {
  const result = assignPools({ divisionId: 'division-open', entrants: entrants(2) });
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'ADMIN_DECISION_REQUIRED',
      message: 'At least 3 entrants are required for automatic pool assignment',
    },
  });
});

test('round robin is deterministic and schedules each pair once', () => {
  const input = {
    divisionId: 'division-open',
    poolId: 'pool-a',
    entrantIds: ['entrant-1', 'entrant-2', 'entrant-3', 'entrant-4'],
  };
  const first = generateRoundRobin(input);
  const second = generateRoundRobin(input);

  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.matches.length, 6);
  assert.equal(new Set(first.matches.map((match) =>
    [match.slots[0].entrantId, match.slots[1].entrantId].sort().join(':'))).size, 6);
});

test('rankPool resolves metrics first and requires an explicit audited public draw', () => {
  const matches = [
    completedMatch('m1', 'a', 'b', 11, 9),
    completedMatch('m2', 'b', 'c', 11, 9),
    completedMatch('m3', 'c', 'a', 11, 9),
  ];
  const unresolved = rankPool({
    poolId: 'pool-a',
    entrantIds: ['a', 'b', 'c'],
    matches,
    headToHeadRule: 'only_two_way',
  });
  assert.equal(unresolved.ok, false);
  assert.equal(unresolved.error.code, 'PUBLIC_DRAW_REQUIRED');
  assert.deepEqual(unresolved.error.candidateEntrantIds, ['a', 'b', 'c']);

  const publicDraw = {
    drawId: 'draw-1',
    candidateEntrantIds: ['a', 'b', 'c'],
    orderedEntrantIds: ['c', 'a', 'b'],
    operatorId: 'operator-1',
    resolvedAt: '2026-07-28T12:00:00.000Z',
  };
  const resolved = rankPool({
    poolId: 'pool-a',
    entrantIds: ['a', 'b', 'c'],
    matches,
    headToHeadRule: 'only_two_way',
    publicDraws: [publicDraw],
  });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.standings.map((row) => row.entrantId), ['c', 'a', 'b']);
  assert.equal(resolved.standings[0].publicDrawId, 'draw-1');
});

test('rankPool rejects a recorded match without a game winner', () => {
  const result = rankPool({
    poolId: 'pool-a',
    entrantIds: ['a', 'b'],
    matches: [completedMatch('m1', 'a', 'b', 10, 10)],
    headToHeadRule: 'only_two_way',
  });
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message: 'Recorded match m1 must have a game winner',
    },
  });
});

test('rankPool rejects malformed public draw audit input', () => {
  const matches = [
    completedMatch('m1', 'a', 'b', 11, 9),
    completedMatch('m2', 'b', 'c', 11, 9),
    completedMatch('m3', 'c', 'a', 11, 9),
  ];
  const result = rankPool({
    poolId: 'pool-a',
    entrantIds: ['a', 'b', 'c'],
    matches,
    headToHeadRule: 'only_two_way',
    publicDraws: [{
      drawId: 'draw-1',
      candidateEntrantIds: ['a', 'b', 'c'],
      orderedEntrantIds: ['c', 'a', 'b'],
    }],
  });
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message: 'Public draw resolution must include valid audit metadata',
    },
  });
});

test('qualifier mapping and KO generation are deterministic with explicit byes', () => {
  const mapping = mapQualifiersToKo({
    pools: [
      { poolId: 'pool-a', standings: standingIds('pool-a', ['a1', 'a2']) },
      { poolId: 'pool-b', standings: standingIds('pool-b', ['b1', 'b2']) },
      { poolId: 'pool-c', standings: standingIds('pool-c', ['c1', 'c2']) },
    ],
    kPerPool: 2,
  });
  assert.equal(mapping.ok, true);
  assert.deepEqual(mapping.qualifiers.map((item) => item.entrantId), ['a1', 'b1', 'c1', 'c2', 'b2', 'a2']);

  const bracket = generateKoBracket({
    divisionId: 'division-open',
    qualifiers: mapping.qualifiers,
  });
  assert.equal(bracket.ok, true);
  assert.equal(bracket.bracket.bracketSize, 8);
  assert.equal(bracket.bracket.rounds[0].matches.length, 4);
  assert.equal(bracket.bracket.rounds[0].matches.flatMap((match) => match.slots)
    .filter((slot) => slot.state === 'bye').length, 2);
});

test('qualifier mapping avoids first-round same-pool rematches for even pool counts', () => {
  const mapping = mapQualifiersToKo({
    pools: [
      { poolId: 'pool-a', standings: standingIds('pool-a', ['a1', 'a2']) },
      { poolId: 'pool-b', standings: standingIds('pool-b', ['b1', 'b2']) },
      { poolId: 'pool-c', standings: standingIds('pool-c', ['c1', 'c2']) },
      { poolId: 'pool-d', standings: standingIds('pool-d', ['d1', 'd2']) },
    ],
    kPerPool: 2,
  });
  assert.equal(mapping.ok, true);
  const bracket = generateKoBracket({ divisionId: 'division-open', qualifiers: mapping.qualifiers });
  assert.equal(bracket.ok, true);
  assert.equal(bracket.bracket.rematchAvoidanceStatus, 'avoided');
});

test('KO generation rejects duplicate or gapped seed orders', () => {
  const base = [
    { entrantId: 'a1', poolId: 'pool-a', poolRank: 1, seedOrder: 1 },
    { entrantId: 'b1', poolId: 'pool-b', poolRank: 1, seedOrder: 2 },
  ];
  for (const qualifiers of [
    [{ ...base[0] }, { ...base[1], seedOrder: 1 }],
    [{ ...base[0] }, { ...base[1], seedOrder: 3 }],
  ]) {
    assert.deepEqual(generateKoBracket({ divisionId: 'division-open', qualifiers }), {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Qualifier seedOrder values must be unique and contiguous from 1',
      },
    });
  }
});

test('withdrawal preserves played pool matches and defaults remaining matches', () => {
  const matches = [
    completedMatch('m1', 'a', 'b', 11, 7),
    scheduledMatch('m2', 'a', 'c'),
    scheduledMatch('m3', 'b', 'c'),
  ];
  const result = applyWithdrawal({
    stage: 'pool',
    withdrawnEntrantId: 'a',
    matches,
    withdrawalRule: 'preserve_played_default_remaining',
    reason: 'injury',
    audit: {
      auditEventId: 'audit-withdrawal',
      actorId: 'operator-1',
      occurredAt: '2026-07-28T12:00:00.000Z',
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches[0], matches[0]);
  assert.equal(result.matches[1].scoreState, 'defaulted');
  assert.deepEqual(result.matches[1].games, [{ homeScore: 0, awayScore: 11 }]);
  assert.equal(result.matches[1].defaultMetadata.reason, 'injury');
  assert.equal(result.matches[2].scoreState, 'scheduled');
});

test('configured withdrawal rule invalidates all matches when less than half were played', () => {
  const result = applyWithdrawal({
    stage: 'pool',
    withdrawnEntrantId: 'a',
    matches: [
      completedMatch('m1', 'a', 'b', 11, 7),
      scheduledMatch('m2', 'a', 'c'),
      scheduledMatch('m3', 'a', 'd'),
    ],
    withdrawalRule: 'invalidate_if_less_than_half_played',
    reason: 'injury',
    audit: {
      auditEventId: 'audit-invalidate',
      actorId: 'operator-1',
      occurredAt: '2026-07-28T12:00:00.000Z',
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.invalidatedMatchIds, ['m1', 'm2', 'm3']);
  assert.equal(result.matches.every((match) => match.scoreState === 'invalidated'), true);
});

test('pool withdrawal leaves KO matches in a mixed snapshot untouched', () => {
  const koMatch = scheduledKoMatch('ko-1', 'a', 'd');
  const result = applyWithdrawal({
    stage: 'pool',
    withdrawnEntrantId: 'a',
    matches: [scheduledMatch('pool-1', 'a', 'b'), koMatch],
    withdrawalRule: 'preserve_played_default_remaining',
    reason: 'injury',
    audit: {
      auditEventId: 'audit-stage-boundary',
      actorId: 'operator-1',
      occurredAt: '2026-07-28T12:00:00.000Z',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.matches[0].scoreState, 'defaulted');
  assert.deepEqual(result.matches[1], koMatch);
});

test('post-publication withdrawal creates a bye without reseeding KO slots', () => {
  const matches = [scheduledKoMatch('ko-1', 'a', 'b'), scheduledKoMatch('ko-2', 'c', 'd')];
  const result = applyWithdrawal({
    stage: 'ko',
    withdrawnEntrantId: 'b',
    matches,
    withdrawalRule: 'preserve_played_default_remaining',
    reason: 'injury',
    postPublication: true,
    audit: {
      auditEventId: 'audit-ko-withdrawal',
      actorId: 'operator-1',
      occurredAt: '2026-07-28T12:00:00.000Z',
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches[0].slots.map((slot) => slot.entrantId), ['a', undefined]);
  assert.deepEqual(result.matches[0].slots.map((slot) => slot.state), ['assigned', 'bye']);
  assert.equal(result.matches[0].slots[1].withdrawnEntrantId, 'b');
  assert.equal(result.matches[1].slots[0].entrantId, 'c');
});

function completedMatch(matchId, home, away, homeScore, awayScore) {
  return {
    matchId,
    divisionId: 'division-open',
    stage: 'pool',
    poolId: 'pool-a',
    round: 1,
    slots: [
      { slotId: `${matchId}-home`, entrantId: home, state: 'assigned' },
      { slotId: `${matchId}-away`, entrantId: away, state: 'assigned' },
    ],
    scoreState: 'completed',
    games: [{ homeScore, awayScore }],
  };
}

function scheduledMatch(matchId, home, away) {
  return {
    matchId,
    divisionId: 'division-open',
    stage: 'pool',
    poolId: 'pool-a',
    round: 1,
    slots: [
      { slotId: `${matchId}-home`, entrantId: home, state: 'assigned' },
      { slotId: `${matchId}-away`, entrantId: away, state: 'assigned' },
    ],
    scoreState: 'scheduled',
    games: [],
  };
}

function scheduledKoMatch(matchId, home, away) {
  return {
    ...scheduledMatch(matchId, home, away),
    stage: 'ko',
    poolId: undefined,
  };
}

function standingIds(poolId, ids) {
  return ids.map((entrantId, index) => ({
    poolId,
    entrantId,
    rank: index + 1,
    wins: ids.length - index,
    losses: index,
    gameDifferential: ids.length - index,
    pointDifferential: ids.length - index,
    headToHead: { applied: false, opponentEntrantIds: [] },
    tieStatus: 'resolved',
    derivedFromMatchIds: [],
  }));
}
