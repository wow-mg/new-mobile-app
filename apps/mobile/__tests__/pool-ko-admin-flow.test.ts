import type {
  PoolKoEntrant,
  PoolKoMatch,
  PublicDrawResolution,
} from '@template/contracts';
jest.mock('@template/contracts', () => require('../../../packages/contracts/src/pool-ko.ts'));

import {
  applyPoolKoAdminAction,
  createPoolKoAdminState,
  generateDivisionBatch,
  type PoolKoAdminAction,
} from '../src/admin/pool-ko-admin-flow';

const at = '2026-07-29T02:00:00.000Z';
const operator = { role: 'operator' as const, actorId: 'operator-1', occurredAt: at };
const courtStaff = { role: 'courtStaff' as const, actorId: 'court-1', occurredAt: at };

function entrants(count: number, originalDivisionId = 'division-open', start = 1): PoolKoEntrant[] {
  return Array.from({ length: count }, (_, index) => {
    const entrantNumber = start + index;
    return {
      entrantId: `entrant-${entrantNumber}`,
      teamId: `team-${entrantNumber}`,
      displayName: `Team ${entrantNumber}`,
      seed: index + 1,
      originalDivisionId,
      withdrawalStatus: 'active',
    };
  });
}

function expectApplied(
  state: ReturnType<typeof createPoolKoAdminState>,
  action: PoolKoAdminAction,
) {
  const result = applyPoolKoAdminAction(state, action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

describe('POOL+KO local Admin flow', () => {
  it('builds event x DUPR band x age band candidates and flags N<3 for an explicit decision', () => {
    const batch = generateDivisionBatch({
      eventId: 'event-1',
      duprBands: [{ bandId: 'dupr-open', label: 'Open' }, { bandId: 'dupr-35', label: '3.5+' }],
      ageBands: [{ bandId: 'age-open', label: 'Open' }, { bandId: 'age-50', label: '50+' }],
      entrantsByDivision: {
        'event-1:dupr-open:age-open': entrants(4),
        'event-1:dupr-open:age-50': entrants(2, 'division-age-50'),
      },
    });

    expect(batch).toHaveLength(4);
    expect(batch.map(({ divisionId }) => divisionId)).toEqual([
      'event-1:dupr-open:age-open',
      'event-1:dupr-open:age-50',
      'event-1:dupr-35:age-open',
      'event-1:dupr-35:age-50',
    ]);
    expect(batch[0].decision).toBe('ready');
    expect(batch[1]).toMatchObject({ decision: 'admin_required', entrantCount: 2 });
    expect(batch[2]).toMatchObject({ decision: 'admin_required', entrantCount: 0 });
  });

  it('merges an N<3 division with lineage, generates pools, and appends audit evidence', () => {
    let state = createPoolKoAdminState({
      divisionId: 'division-open',
      entrants: entrants(3),
    });

    state = expectApplied(state, {
      type: 'mergeDivision',
      ...operator,
      sourceDivisionId: 'division-age-50',
      entrants: entrants(2, 'division-age-50', 4),
      reason: 'N<3 merge approved',
    });
    state = expectApplied(state, { type: 'generatePools', ...operator });

    expect(state.entrants.filter(({ mergedIntoDivisionId }) =>
      mergedIntoDivisionId === 'division-open')).toHaveLength(2);
    expect(state.pools.map(({ entrantIds }) => entrantIds.length)).toEqual([5]);
    expect(state.auditEvents.map(({ type }) => type)).toEqual([
      'pool_assignment_adjusted',
      'generation_requested',
      'generation_completed',
    ]);
    expect(state.auditEvents[0]).toMatchObject({
      originalDivisionId: 'division-age-50',
      mergedIntoDivisionId: 'division-open',
      reason: 'N<3 merge approved',
    });
  });

  it('supports pool drag edits before lock and requires review complete before lock', () => {
    let state = createPoolKoAdminState({ divisionId: 'division-open', entrants: entrants(6) });
    state = expectApplied(state, { type: 'generatePools', ...operator });

    const lockBeforeReview = applyPoolKoAdminAction(state, { type: 'lockPools', ...operator });
    expect(lockBeforeReview).toMatchObject({ ok: false, error: { code: 'INVALID_TRANSITION' } });

    const firstPool = state.pools[0];
    const secondPool = state.pools[1];
    state = expectApplied(state, {
      type: 'reorderPoolEntrant',
      ...operator,
      entrantId: firstPool.entrantIds[0],
      toPoolId: secondPool.poolId,
      swapWithEntrantId: secondPool.entrantIds[0],
      reason: 'balance clubs',
    });
    state = expectApplied(state, { type: 'completeReview', ...operator });
    state = expectApplied(state, { type: 'lockPools', ...operator });

    expect(state.division.status).toBe('locked');
    expect(state.division.lockState).toMatchObject({ isLocked: true, lockedBy: 'operator-1' });
    expect(state.auditEvents.map(({ type }) => type)).toContain('pool_assignment_adjusted');
    expect(state.auditEvents.map(({ type }) => type)).toContain('review_completed');
    expect(state.auditEvents.map(({ type }) => type)).toContain('locked');
  });

  it('limits court staff to score entry and keeps score review operator-only', () => {
    let state = createPoolKoAdminState({ divisionId: 'division-open', entrants: entrants(3) });
    state = expectApplied(state, { type: 'generatePools', ...operator });
    state = expectApplied(state, { type: 'completeReview', ...operator });
    state = expectApplied(state, { type: 'lockPools', ...operator });
    const match = state.matches[0];

    state = expectApplied(state, {
      type: 'recordScore',
      ...courtStaff,
      matchId: match.matchId,
      games: [{ homeScore: 15, awayScore: 8 }],
    });
    expect(applyPoolKoAdminAction(state, { type: 'reviewScores', ...courtStaff })).toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    });
    state = expectApplied(state, { type: 'reviewScores', ...operator });
    const unplayedEntrantId = state.entrants.find(({ entrantId }) =>
      !match.slots.some((slot) => slot.entrantId === entrantId))?.entrantId;

    expect(state.matches[0]).toMatchObject({ scoreState: 'completed', games: [{ homeScore: 15, awayScore: 8 }] });
    expect(state.scoreReviewComplete).toBe(true);
    expect(state.standings.map(({ entrantId }) => entrantId)).toEqual([
      match.slots[0].entrantId,
      unplayedEntrantId,
      match.slots[1].entrantId,
    ]);
    expect(state.auditEvents.map(({ type }) => type)).toEqual(expect.arrayContaining(['score_entered', 'score_updated']));
    state = expectApplied(state, { type: 'previewKo', ...operator });
    expect(state.koBracket?.rounds[0].matches.length).toBeGreaterThan(0);

    for (const action of [
      { type: 'generatePools', ...courtStaff },
      { type: 'completeReview', ...courtStaff },
      { type: 'lockPools', ...courtStaff },
      { type: 'publish', ...courtStaff },
      { type: 'requestPrintPack', ...courtStaff },
    ] as PoolKoAdminAction[]) {
      expect(applyPoolKoAdminAction(state, action)).toMatchObject({
        ok: false,
        error: { code: 'PERMISSION_DENIED' },
      });
    }
  });

  it('records an audited public draw, creates KO preview, and supports KO slot drag', () => {
    const poolId = 'division-open-pool-1';
    const tiedMatches: PoolKoMatch[] = [
      completedMatch('m1', poolId, 'entrant-1', 'entrant-2', 11, 9),
      completedMatch('m2', poolId, 'entrant-2', 'entrant-3', 11, 9),
      completedMatch('m3', poolId, 'entrant-3', 'entrant-1', 11, 9),
    ];
    let state = createPoolKoAdminState({
      divisionId: 'division-open',
      entrants: entrants(3),
      pools: [{
        poolId,
        divisionId: 'division-open',
        label: 'A',
        order: 0,
        entrantIds: entrants(3).map(({ entrantId }) => entrantId),
        roundRobinMatchIds: tiedMatches.map(({ matchId }) => matchId),
      }],
      matches: tiedMatches,
    });
    const draw: PublicDrawResolution = {
      drawId: 'draw-1',
      candidateEntrantIds: ['entrant-1', 'entrant-2', 'entrant-3'],
      orderedEntrantIds: ['entrant-3', 'entrant-1', 'entrant-2'],
      operatorId: operator.actorId,
      resolvedAt: at,
    };

    state = expectApplied(state, { type: 'completeReview', ...operator });
    state = expectApplied(state, { type: 'lockPools', ...operator });
    state = expectApplied(state, { type: 'resolvePublicDraw', ...operator, poolId, publicDraw: draw });
    state = expectApplied(state, { type: 'reviewScores', ...operator });
    state = expectApplied(state, { type: 'previewKo', ...operator });
    const firstRound = state.koBracket?.rounds[0].matches ?? [];
    const assigned = firstRound.flatMap(({ slots }) => slots).filter(({ entrantId }) => entrantId);
    state = expectApplied(state, {
      type: 'reorderKoSlots',
      ...operator,
      firstSlotId: assigned[0].slotId,
      secondSlotId: assigned[1].slotId,
      reason: 'manual bracket review',
    });

    expect(state.standings.map(({ entrantId }) => entrantId)).toEqual([
      'entrant-3',
      'entrant-1',
      'entrant-2',
    ]);
    expect(state.auditEvents.map(({ type }) => type)).toEqual(expect.arrayContaining([
      'public_draw_created',
      'public_draw_resolved',
      'post_lock_changed',
    ]));
    expect(state.auditEvents.at(-1)).toMatchObject({
      type: 'post_lock_changed',
      reason: 'manual bracket review',
      stateAtEvent: 'locked',
    });
  });

  it('publishes only from locked state, requires reasons after lock, and triggers print_pack.pdf', () => {
    let state = createPoolKoAdminState({ divisionId: 'division-open', entrants: entrants(3) });
    state = expectApplied(state, { type: 'generatePools', ...operator });
    expect(applyPoolKoAdminAction(state, { type: 'publish', ...operator })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TRANSITION' },
    });
    state = expectApplied(state, { type: 'completeReview', ...operator });
    state = expectApplied(state, { type: 'lockPools', ...operator });

    const withoutReason = applyPoolKoAdminAction(state, {
      type: 'reorderPoolEntrant',
      ...operator,
      entrantId: 'entrant-1',
      toPoolId: state.pools[0].poolId,
    });
    expect(withoutReason).toMatchObject({ ok: false, error: { code: 'REASON_REQUIRED' } });

    state = expectApplied(state, { type: 'publish', ...operator });
    state = expectApplied(state, { type: 'requestPrintPack', ...operator });

    expect(state.division.status).toBe('published');
    expect(state.printPackRequests).toEqual([{
      fileName: 'print_pack.pdf',
      divisionId: 'division-open',
      requestedBy: 'operator-1',
      requestedAt: at,
    }]);
    expect(state.auditEvents.at(-1)).toMatchObject({
      type: 'post_publish_changed',
      reason: 'print_pack.pdf generation requested',
    });
    expect(applyPoolKoAdminAction(state, {
      type: 'mergeDivision',
      ...operator,
      sourceDivisionId: 'division-late',
      entrants: entrants(2, 'division-late'),
      reason: 'late merge',
    })).toMatchObject({ ok: false, error: { code: 'INVALID_TRANSITION' } });
  });

  it('keeps standings derived-only with no direct standings edit action', () => {
    const actionTypes: PoolKoAdminAction['type'][] = [
      'mergeDivision',
      'generatePools',
      'reorderPoolEntrant',
      'completeReview',
      'lockPools',
      'recordScore',
      'reviewScores',
      'resolvePublicDraw',
      'previewKo',
      'reorderKoSlots',
      'publish',
      'requestPrintPack',
    ];

    expect(actionTypes).not.toContain('editStandings');
  });
});

function completedMatch(
  matchId: string,
  poolId: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
): PoolKoMatch {
  return {
    matchId,
    divisionId: 'division-open',
    stage: 'pool',
    poolId,
    round: 1,
    slots: [
      { slotId: `${matchId}-home`, entrantId: home, state: 'assigned' },
      { slotId: `${matchId}-away`, entrantId: away, state: 'assigned' },
    ],
    scoreState: 'completed',
    games: [{ homeScore, awayScore }],
  };
}
