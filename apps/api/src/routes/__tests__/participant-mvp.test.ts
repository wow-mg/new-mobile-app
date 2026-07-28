import { beforeEach, describe, expect, it } from 'vitest';
import {
  participantApiErrorResponseSchema,
  participantProfileSchema,
  supportCenterResponseSchema,
  notificationListResponseSchema,
  myPageResponseSchema,
  participantGamesResponseSchema,
  tournamentApplicationSchema,
  tournamentListResponseSchema,
  tournamentDetailSchema,
} from '@template/contracts';
import { app } from '../../app.js';
import { resetParticipantMvpState } from '../../services/participant-mvp.service.js';

const authHeaders = { authorization: 'Bearer test' };

async function requestJson(path: string, init?: RequestInit) {
  const res = await app.request(path, {
    ...init,
    headers: { ...authHeaders, 'content-type': 'application/json', ...init?.headers },
  });
  return { res, body: await res.json() };
}

describe('participant MVP dev-preview endpoints', () => {
  beforeEach(async () => {
    await resetParticipantMvpState();
  });

  it('answers browser preflight requests before bearer auth for the deployed mobile origin', async () => {
    const res = await app.request('/api/tournaments', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://picklehub-mobile-dev-production.up.railway.app',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://picklehub-mobile-dev-production.up.railway.app',
    );
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('lists and returns the sandbox tournament API shape', async () => {
    const list = await requestJson('/api/tournaments');
    expect(list.res.status).toBe(200);
    const parsedList = tournamentListResponseSchema.parse(list.body);
    expect(parsedList.tournaments[0]?.tournamentId).toBe('tournament_sandbox_001');

    const detail = await requestJson('/api/tournaments/tournament_sandbox_001');
    expect(detail.res.status).toBe(200);
    const parsedDetail = tournamentDetailSchema.parse(detail.body);
    expect(parsedDetail.divisions[0]?.tournamentId).toBe('tournament_sandbox_001');
  });

  it('exposes DB-backed participant support, notifications, and mypage payloads with memory fallback', async () => {
    const support = await requestJson('/api/participant/support');
    expect(support.res.status).toBe(200);
    expect(supportCenterResponseSchema.parse(support.body)).toMatchObject({
      contactEmail: 'support@happickle.kr',
    });

    const createdInquiry = await requestJson('/api/participant/support/inquiries', {
      method: 'POST',
      body: JSON.stringify({ category: 'dupr', subject: 'DUPR 확인 문의' }),
    });
    expect(createdInquiry.res.status).toBe(201);

    const notifications = await requestJson('/api/participant/notifications');
    expect(notifications.res.status).toBe(200);
    expect(notificationListResponseSchema.parse(notifications.body).notifications.length).toBeGreaterThanOrEqual(4);

    const myPage = await requestJson('/api/participant/mypage');
    expect(myPage.res.status).toBe(200);
    expect(myPageResponseSchema.parse(myPage.body).profile.participantId).toBe('participant_sandbox_001');

    const games = await requestJson('/api/participant/games');
    expect(games.res.status).toBe(200);
    expect(participantGamesResponseSchema.parse(games.body).games).toEqual([]);
  });

  it('exposes participant profile and updates self-reported DUPR state', async () => {
    const initial = await requestJson('/api/participant/profile');
    expect(initial.res.status).toBe(200);
    expect(participantProfileSchema.parse(initial.body).duprStatus).toBe('missing');

    const updated = await requestJson('/api/participant/profile', {
      method: 'PATCH',
      body: JSON.stringify({ duprId: ' dupr-777 ' }),
    });
    expect(updated.res.status).toBe(200);
    expect(participantProfileSchema.parse(updated.body)).toMatchObject({
      duprId: 'DUPR-777',
      duprStatus: 'selfReportedPendingOperatorReview',
    });
  });

  it('requires a DUPR profile before creating a tournament application', async () => {
    const blocked = await requestJson('/api/tournament-applications', {
      method: 'POST',
      body: JSON.stringify({ tournamentId: 'tournament_sandbox_001' }),
    });

    expect(blocked.res.status).toBe(400);
    expect(participantApiErrorResponseSchema.parse(blocked.body)).toMatchObject({ error: 'DUPR_PROFILE_REQUIRED' });
  });

  it('returns contract-owned not-found participant API errors', async () => {
    const missingTournament = await requestJson('/api/tournaments/missing-tournament');
    expect(missingTournament.res.status).toBe(404);
    expect(participantApiErrorResponseSchema.parse(missingTournament.body)).toMatchObject({
      error: 'TOURNAMENT_NOT_FOUND',
    });

    const missingApplication = await requestJson('/api/tournament-applications/missing-application');
    expect(missingApplication.res.status).toBe(404);
    expect(participantApiErrorResponseSchema.parse(missingApplication.body)).toMatchObject({
      error: 'APPLICATION_NOT_FOUND',
    });
  });

  it('creates and reads a submitted tournament application', async () => {
    await requestJson('/api/participant/profile', {
      method: 'PATCH',
      body: JSON.stringify({ duprId: 'DUPR-12345' }),
    });

    const created = await requestJson('/api/tournament-applications', {
      method: 'POST',
      body: JSON.stringify({ tournamentId: 'tournament_sandbox_001' }),
    });
    expect(created.res.status).toBe(201);
    const application = tournamentApplicationSchema.parse(created.body);
    expect(application).toMatchObject({
      applicationId: 'application_tournament_sandbox_001_participant_sandbox_001',
      status: 'submitted',
      duprId: 'DUPR-12345',
      divisionId: 'division_sandbox_mixed_35',
      paymentStatus: 'notStartedSandbox',
    });

    const fetched = await requestJson(`/api/tournament-applications/${application.applicationId}`);
    expect(fetched.res.status).toBe(200);
    expect(tournamentApplicationSchema.parse(fetched.body)).toMatchObject({
      applicationId: application.applicationId,
      divisionId: 'division_sandbox_mixed_35',
    });

    const games = await requestJson('/api/participant/games');
    expect(games.res.status).toBe(200);
    expect(participantGamesResponseSchema.parse(games.body).games[0]).toMatchObject({
      applicationId: application.applicationId,
      tournamentId: 'tournament_sandbox_001',
      tournamentTitle: '2026 협회장배 전국오픈',
      divisionName: '혼합복식',
      location: '올림픽공원 SK핸드볼경기장',
      applicationStatus: 'submitted',
      paymentStatus: 'notStartedSandbox',
      paymentAmountKrw: 60000,
      dataSource: expect.stringMatching(/db|memoryFallback/),
    });
  });

  it('blocks participant self-cancel requests and preserves the application record', async () => {
    await requestJson('/api/participant/profile', {
      method: 'PATCH',
      body: JSON.stringify({ duprId: 'DUPR-12345' }),
    });

    const created = await requestJson('/api/tournament-applications', {
      method: 'POST',
      body: JSON.stringify({ tournamentId: 'tournament_sandbox_001' }),
    });
    const application = tournamentApplicationSchema.parse(created.body);

    const blocked = await requestJson(`/api/tournament-applications/${application.applicationId}`, {
      method: 'DELETE',
    });
    expect(blocked.res.status).toBe(400);
    expect(participantApiErrorResponseSchema.parse(blocked.body)).toMatchObject({
      error: 'PARTICIPANT_SELF_CANCEL_DISABLED',
    });

    const fetched = await requestJson(`/api/tournament-applications/${application.applicationId}`);
    expect(fetched.res.status).toBe(200);
    expect(tournamentApplicationSchema.parse(fetched.body)).toMatchObject({
      applicationId: application.applicationId,
      divisionId: 'division_sandbox_mixed_35',
      refundPolicy: 'participantSelfCancelDisabled',
      supportChannel: 'oneToOneInquiry',
    });
  });
});
