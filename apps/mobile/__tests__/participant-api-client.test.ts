import { participantApiErrorCodeSchema, participantApplicationErrorCodeSchema } from '@template/contracts';
import { createParticipantApiClient, getParticipantApiConfigFromPublicEnv } from '../src/participant/api-client';
import { describeApplicationPolicy, describeSupportRefundPolicyCopy } from '../src/participant/mock-session';

const tournament = {
  tournamentId: 'tournament_api_001',
  title: 'API Open',
  division: 'Mixed Doubles',
  location: 'API Court',
  startsAt: '2026-08-09T00:00:00.000Z',
  applicationStatus: 'available' as const,
  requiresDupr: true as const,
  paymentMode: 'operatorManagedOffline' as const,
  cancellationPolicy: 'operatorSupportOnly' as const,
};

const tournamentDetail = {
  ...tournament,
  divisions: [{ divisionId: 'division_api_001', tournamentId: tournament.tournamentId, name: '혼합복식', skillLevel: 'DUPR 3.5+', teamType: 'doubles', entryFeeKrw: 60000, capacityTeams: 32 }],
};

const profile = {
  participantId: 'participant_api_001',
  displayName: 'API Player',
  duprId: 'DUPR-API',
  duprStatus: 'selfReportedPendingOperatorReview' as const,
  supportChannel: 'oneToOneInquiry' as const,
};

const application = {
  applicationId: 'application_api_001',
  tournamentId: tournament.tournamentId,
  participantId: profile.participantId,
  duprId: profile.duprId,
  divisionId: 'division_api_001',
  status: 'submitted' as const,
  submittedAt: '2026-07-10T00:00:00.000Z',
  supportChannel: 'oneToOneInquiry' as const,
  paymentStatus: 'notStartedSandbox' as const,
  refundPolicy: 'participantSelfCancelDisabled' as const,
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return {
    ok: init?.status ? init.status >= 200 && init.status < 300 : true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

describe('participant API client', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
  });

  it('stays disabled without bearer auth so the app can use mock fallback', async () => {
    const client = createParticipantApiClient({ baseUrl: 'https://api.example.invalid' });

    expect(client.enabled).toBe(false);
    await expect(client.getTournaments()).rejects.toThrow('PARTICIPANT_API_NOT_CONFIGURED');
  });

  it('never reads a bearer credential from public mobile environment config', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.invalid';
    process.env.EXPO_PUBLIC_PARTICIPANT_API_BEARER_TOKEN = 'public-token-shaped-value';

    const config = getParticipantApiConfigFromPublicEnv();
    expect(config).toEqual({ baseUrl: 'https://api.example.invalid' });
    expect(createParticipantApiClient(config).enabled).toBe(false);
  });

  it('calls authenticated participant MVP endpoints and parses responses', async () => {
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (url.endsWith('/api/tournaments')) return jsonResponse({ tournaments: [tournament] });
      if (url.endsWith('/api/tournaments/tournament_api_001')) return jsonResponse(tournamentDetail);
      if (url.endsWith('/api/participant/profile') && init?.method === 'GET') return jsonResponse(profile);
      if (url.endsWith('/api/participant/support') && init?.method === 'GET') return jsonResponse({ policyCopy: '참가자 직접 취소 불가 · 1:1 문의. Participant self-cancel/refund is not available in MVP.', contactEmail: 'support@happickle.kr', operatingHours: '평일 10:00 ~ 18:00', inquiries: [] });
      if (url.endsWith('/api/participant/support/inquiries') && init?.method === 'POST') return jsonResponse({ inquiryId: 'inquiry_api_002', participantId: profile.participantId, channel: 'oneToOneInquiry', category: body.category, subject: body.subject, status: 'operatorReview', createdAt: '2026-07-13T00:00:00.000Z' });
      if (url.endsWith('/api/participant/notifications')) return jsonResponse({ notifications: [{ notificationId: 'notification_api_001', participantId: profile.participantId, type: 'support', title: 'API 알림', body: 'API 본문', createdAt: '2026-07-13T00:00:00.000Z' }] });
      if (url.endsWith('/api/participant/mypage')) return jsonResponse({ profile, applications: [application], paymentRecords: [{ paymentRecordId: 'payment_api_001', applicationId: application.applicationId, participantId: profile.participantId, amountKrw: 60000, paymentMode: 'operatorManagedOffline', status: 'notStartedSandbox', operatorNote: '대기', recordedAt: '2026-07-13T00:00:00.000Z' }] });
      if (url.endsWith('/api/participant/games')) return jsonResponse({ games: [{ gameId: 'game_api_001', applicationId: application.applicationId, tournamentId: tournament.tournamentId, tournamentTitle: tournament.title, divisionName: '혼합복식', location: tournament.location, startsAt: tournament.startsAt, applicationStatus: 'submitted', paymentStatus: 'notStartedSandbox', paymentAmountKrw: 60000, supportChannel: 'oneToOneInquiry', dataSource: 'db' }] });
      if (url.endsWith('/api/participant/profile') && init?.method === 'PATCH') return jsonResponse({ ...profile, duprId: body.duprId });
      if (url.endsWith('/api/tournament-applications') && init?.method === 'POST') return jsonResponse({ ...application, ...body });
      if (url.endsWith('/api/tournament-applications/application_api_001') && init?.method === 'GET') return jsonResponse(application);
      if (url.endsWith('/api/tournament-applications/application_api_001') && init?.method === 'DELETE') return jsonResponse({ error: participantApplicationErrorCodeSchema.enum.PARTICIPANT_SELF_CANCEL_DISABLED }, { status: 400 });
      return jsonResponse({ error: 'not found' }, { status: 404 });
    }) as unknown as typeof fetch;

    const client = createParticipantApiClient({ baseUrl: 'https://api.example.invalid/', bearerToken: 'test-token', fetchImpl });

    await expect(client.getTournaments()).resolves.toEqual([tournament]);
    await expect(client.getTournament(tournament.tournamentId)).resolves.toEqual(tournamentDetail);
    await expect(client.getParticipantProfile()).resolves.toEqual(profile);
    await expect(client.getSupportCenter()).resolves.toMatchObject({ contactEmail: 'support@happickle.kr' });
    await expect(client.createSupportInquiry({ category: 'refund', subject: 'MVP 환불/취소 1:1 문의' })).resolves.toMatchObject({ inquiryId: 'inquiry_api_002', channel: 'oneToOneInquiry', status: 'operatorReview' });
    await expect(client.getNotifications()).resolves.toMatchObject({ notifications: [expect.objectContaining({ title: 'API 알림' })] });
    await expect(client.getMyPage()).resolves.toMatchObject({ paymentRecords: [expect.objectContaining({ amountKrw: 60000 })] });
    await expect(client.getGames()).resolves.toEqual([expect.objectContaining({ tournamentTitle: 'API Open', dataSource: 'db' })]);
    await expect(client.updateParticipantProfile({ duprId: 'DUPR-777' })).resolves.toMatchObject({ duprId: 'DUPR-777' });
    await expect(client.createTournamentApplication({ tournamentId: tournament.tournamentId, participantId: profile.participantId, duprId: profile.duprId, divisionId: 'division_api_001' })).resolves.toMatchObject({ tournamentId: tournament.tournamentId, divisionId: 'division_api_001' });
    await expect(client.getTournamentApplication(application.applicationId)).resolves.toEqual(application);
    await expect(client.requestParticipantSelfCancel(application.applicationId)).rejects.toThrow(participantApplicationErrorCodeSchema.enum.PARTICIPANT_SELF_CANCEL_DISABLED);

    const apiApplication = await client.getTournamentApplication(application.applicationId);
    expect(describeApplicationPolicy(apiApplication)).toBe('참가자 직접 취소 불가 · 1:1 문의');
    expect(describeSupportRefundPolicyCopy(apiApplication)).toContain('참가자 직접 취소/환불은 1:1 문의로 운영자가 확인합니다.');

    expect(fetchImpl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/api\.example\.invalid\/api\//), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }));
  });

  it('surfaces API application policy errors before falling back to generic HTTP status', async () => {
    const duprRequiredFetch = jest.fn(async () => jsonResponse({ error: participantApplicationErrorCodeSchema.enum.DUPR_PROFILE_REQUIRED }, { status: 400 })) as unknown as typeof fetch;
    const duprRequiredClient = createParticipantApiClient({ baseUrl: 'https://api.example.invalid', bearerToken: 'test-token', fetchImpl: duprRequiredFetch });

    await expect(duprRequiredClient.createTournamentApplication({ tournamentId: tournament.tournamentId, participantId: profile.participantId })).rejects.toThrow(participantApplicationErrorCodeSchema.enum.DUPR_PROFILE_REQUIRED);

    const unavailableFetch = jest.fn(async () => jsonResponse({ error: 'nope' }, { status: 503 })) as unknown as typeof fetch;
    const unavailableClient = createParticipantApiClient({ baseUrl: 'https://api.example.invalid', bearerToken: 'test-token', fetchImpl: unavailableFetch });

    await expect(unavailableClient.getParticipantProfile()).rejects.toThrow('PARTICIPANT_API_HTTP_503');

    const notFoundFetch = jest.fn(async () => jsonResponse({ error: participantApiErrorCodeSchema.enum.TOURNAMENT_NOT_FOUND }, { status: 404 })) as unknown as typeof fetch;
    const notFoundClient = createParticipantApiClient({ baseUrl: 'https://api.example.invalid', bearerToken: 'test-token', fetchImpl: notFoundFetch });

    await expect(notFoundClient.getTournament('missing')).rejects.toThrow(participantApiErrorCodeSchema.enum.TOURNAMENT_NOT_FOUND);
  });

  it('falls back to HTTP status when API failure has no application error code', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({}, { status: 503 })) as unknown as typeof fetch;
    const client = createParticipantApiClient({ baseUrl: 'https://api.example.invalid', bearerToken: 'test-token', fetchImpl });

    await expect(client.getParticipantProfile()).rejects.toThrow('PARTICIPANT_API_HTTP_503');
  });
});
