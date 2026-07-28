import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  participantApiErrorCodeSchema,
  participantApiErrorResponseSchema,
  participantApiHttpErrorCodeSchema,
  participantApplicationErrorCodeSchema,
  participantProfileSchema,
  supportChannelSchema,
  tournamentApplicationSchema,
  tournamentSchema,
} from '../dist/index.js';

test('participant MVP policy literals stay stable for API, contracts, and mobile copy', () => {
  assert.equal(supportChannelSchema.parse('oneToOneInquiry'), 'oneToOneInquiry');

  const profile = participantProfileSchema.parse({
    participantId: 'participant_sandbox_001',
    displayName: '김민준',
    duprId: 'DUPR-12345',
    duprStatus: 'selfReportedPendingOperatorReview',
    supportChannel: 'oneToOneInquiry',
  });

  assert.equal(profile.supportChannel, 'oneToOneInquiry');

  const tournament = tournamentSchema.parse({
    tournamentId: 'tournament_sandbox_001',
    title: '송파 오픈 피클볼 토너먼트',
    division: '남자복식 3.5+',
    location: '송파 실내체육관',
    startsAt: '2026-08-15T09:00:00+09:00',
    applicationStatus: 'available',
    requiresDupr: true,
    paymentMode: 'operatorManagedOffline',
    cancellationPolicy: 'operatorSupportOnly',
  });

  assert.equal(tournament.requiresDupr, true);
  assert.equal(tournament.cancellationPolicy, 'operatorSupportOnly');

  const application = tournamentApplicationSchema.parse({
    applicationId: 'application_sandbox_001',
    tournamentId: tournament.tournamentId,
    participantId: profile.participantId,
    duprId: profile.duprId,
    divisionId: 'division_contract_001',
    status: 'submitted',
    submittedAt: '2026-07-11T10:48:00+09:00',
    supportChannel: 'oneToOneInquiry',
    paymentStatus: 'notStartedSandbox',
    refundPolicy: 'participantSelfCancelDisabled',
  });

  assert.equal(application.divisionId, 'division_contract_001');
  assert.equal(application.supportChannel, 'oneToOneInquiry');
  assert.equal(application.refundPolicy, 'participantSelfCancelDisabled');
  assert.equal(participantApplicationErrorCodeSchema.parse('DUPR_PROFILE_REQUIRED'), 'DUPR_PROFILE_REQUIRED');
  assert.equal(
    participantApplicationErrorCodeSchema.parse('PARTICIPANT_SELF_CANCEL_DISABLED'),
    'PARTICIPANT_SELF_CANCEL_DISABLED',
  );
  assert.equal(participantApiErrorCodeSchema.parse('TOURNAMENT_NOT_FOUND'), 'TOURNAMENT_NOT_FOUND');
  assert.equal(participantApiErrorCodeSchema.parse('APPLICATION_NOT_FOUND'), 'APPLICATION_NOT_FOUND');
  assert.equal(participantApiHttpErrorCodeSchema.parse('PARTICIPANT_API_HTTP_503'), 'PARTICIPANT_API_HTTP_503');
  assert.deepEqual(participantApiErrorResponseSchema.parse({ error: 'DUPR_PROFILE_REQUIRED' }), {
    error: 'DUPR_PROFILE_REQUIRED',
  });
  assert.throws(() => participantApiErrorResponseSchema.parse({ error: 'not found' }));
});
