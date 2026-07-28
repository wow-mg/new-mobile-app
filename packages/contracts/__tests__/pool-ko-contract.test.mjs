import assert from 'node:assert/strict';
import test from 'node:test';
import {
  poolKoAuditEventSchema,
  poolKoDivisionSchema,
  poolKoPermissionsSchema,
  poolKoSnapshotSchema,
} from '../dist/index.js';
import { poolKoSnapshotFixture } from '../dist/fixtures/pool-ko.js';

test('stable POOL+KO fixture is accepted for Admin and Participant consumers', () => {
  const snapshot = poolKoSnapshotSchema.parse(poolKoSnapshotFixture);

  assert.equal(snapshot.division.format, 'POOL_KO');
  assert.equal(snapshot.division.kPerPool.source, 'default');
  assert.equal(snapshot.entrants[0].originalDivisionId, 'division-original-a');
  assert.equal(snapshot.entrants[0].mergedIntoDivisionId, 'division-open');
  assert.equal(snapshot.standings[0].derivedFromMatchIds.length > 0, true);
  assert.equal(snapshot.permissions.participant.canViewPublished, true);
});

test('division contract includes lock/publish state and configurable scoring', () => {
  const division = poolKoDivisionSchema.parse(poolKoSnapshotFixture.division);

  assert.equal(division.poolScoringConfig.gamesToWin, 1);
  assert.equal(division.koScoringConfig.gamesToWin, 2);
  assert.equal(division.withdrawalRule, 'preserve_played_default_remaining');
  assert.equal(division.publicDrawPolicy, 'explicit_audited_resolution');
});

test('permissions keep participants read-only and court staff score-only', () => {
  const permissions = poolKoPermissionsSchema.parse(poolKoSnapshotFixture.permissions);

  assert.deepEqual(permissions.participant, { canViewPublished: true });
  assert.deepEqual(permissions.courtStaff, { canEnterScore: true });
  assert.equal('canMutateStandings' in permissions.operator, false);
});

test('audit events require public draw and post-lock evidence fields', () => {
  assert.throws(() => poolKoAuditEventSchema.parse({
    auditEventId: 'audit-draw',
    divisionId: 'division-open',
    type: 'public_draw_resolved',
    actorId: 'operator-1',
    occurredAt: '2026-07-28T12:00:00.000Z',
  }));
  assert.throws(() => poolKoAuditEventSchema.parse({
    auditEventId: 'audit-adjustment',
    divisionId: 'division-open',
    type: 'ko_slot_adjusted',
    actorId: 'operator-1',
    occurredAt: '2026-07-28T12:00:00.000Z',
    stateAtEvent: 'locked',
  }));
});

test('contract surface exposes derived standings without a direct mutation schema', async () => {
  const contract = await import('../dist/index.js');
  const forbidden = [
    'updatePoolStandingRequestSchema',
    'mutateStandings',
    'setPoolStanding',
  ];

  for (const exportName of forbidden) {
    assert.equal(exportName in contract, false);
  }
});
