import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminTournamentDraftListQuerySchema,
  createTournamentDraftRequestSchema,
  tournamentDraftApiErrorResponseSchema,
  tournamentDraftSchema,
  tournamentDraftStatusSchema,
  updateTournamentDraftRequestSchema,
} from '../dist/index.js';

const poolKoConfig = {
  format: 'POOL_KO',
  kPerPool: { value: 2, source: 'default' },
  poolScoringConfig: { bestOfGames: 1, gamesToWin: 1, pointsToWin: 15, winBy: 2 },
  koScoringConfig: { bestOfGames: 3, gamesToWin: 2, pointsToWin: 11, winBy: 2 },
  withdrawalRule: 'preserve_played_default_remaining',
  publicDrawPolicy: 'explicit_audited_resolution',
};

const createInput = {
  title: 'Autumn Open',
  location: 'Riverside courts',
  startsAt: '2026-10-10T09:00:00.000Z',
  applicationStatus: 'available',
  requiresDupr: true,
  paymentMode: 'operatorManagedOffline',
  cancellationPolicy: 'operatorSupportOnly',
  divisions: [{
    name: 'Mixed 3.5',
    skillLevel: '3.5',
    teamType: 'mixedDoubles',
    entryFeeKrw: 60000,
    capacityTeams: 16,
    poolKoConfig,
  }],
};

test('draft statuses keep changes requested, approved, and published distinct', () => {
  assert.deepEqual(tournamentDraftStatusSchema.options, [
    'draft', 'submitted', 'inReview', 'changesRequested', 'rejected', 'approved', 'published',
  ]);
});

test('organizer create/update contracts align divisions with POOL+KO config', () => {
  const created = createTournamentDraftRequestSchema.parse(createInput);
  assert.equal(created.divisions[0].poolKoConfig.format, 'POOL_KO');
  assert.equal(created.divisions[0].poolKoConfig.kPerPool.value, 2);

  const updated = updateTournamentDraftRequestSchema.parse({ title: 'Updated', divisions: createInput.divisions });
  assert.equal(updated.title, 'Updated');
  assert.throws(() => updateTournamentDraftRequestSchema.parse({}));
  assert.throws(() => createTournamentDraftRequestSchema.parse({
    ...createInput,
    paymentMode: 'card',
  }));
});

test('draft response carries owner, review state, divisions, and publication identity', () => {
  const draft = tournamentDraftSchema.parse({
    draftId: 'draft-1',
    organizerId: 'organizer-1',
    status: 'approved',
    ...createInput,
    divisions: [{ divisionId: 'draft-division-1', ...createInput.divisions[0] }],
    submittedAt: '2026-07-31T00:00:00.000Z',
    reviewedAt: '2026-07-31T01:00:00.000Z',
    approvedAt: '2026-07-31T02:00:00.000Z',
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-31T02:00:00.000Z',
  });
  assert.equal(draft.status, 'approved');
  assert.equal(draft.publishedTournamentId, undefined);
});

test('typed draft API errors cover role and transition failures', () => {
  for (const error of [
    'TOURNAMENT_DRAFT_NOT_FOUND',
    'TOURNAMENT_DRAFT_FORBIDDEN',
    'TOURNAMENT_DRAFT_INVALID_TRANSITION',
    'TOURNAMENT_DRAFT_IMMUTABLE',
    'TOURNAMENT_DRAFT_DEV_STAGING_ONLY',
  ]) {
    assert.equal(tournamentDraftApiErrorResponseSchema.parse({ error }).error, error);
  }
});

test('admin list status filter is shared and typed', () => {
  assert.deepEqual(adminTournamentDraftListQuerySchema.parse({ status: 'changesRequested' }), {
    status: 'changesRequested',
  });
  assert.throws(() => adminTournamentDraftListQuerySchema.parse({ status: 'unknown' }));
});
