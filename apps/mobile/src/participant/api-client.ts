import {
  type CreateSupportInquiryRequest,
  type CreateTournamentApplicationRequest,
  type ParticipantGame,
  type ParticipantProfile,
  type SupportCenterResponse,
  type SupportInquiry,
  type Tournament,
  type TournamentDetail,
  type TournamentApplication,
  type UpdateParticipantProfileRequest,
  type NotificationListResponse,
  type MyPageResponse,
  createSupportInquiryRequestSchema,
  createTournamentApplicationRequestSchema,
  myPageResponseSchema,
  notificationListResponseSchema,
  participantApiErrorResponseSchema,
  participantApiHttpErrorCodeSchema,
  participantGamesResponseSchema,
  participantProfileSchema,
  supportCenterResponseSchema,
  supportInquirySchema,
  tournamentApplicationSchema,
  tournamentListResponseSchema,
  tournamentDetailSchema,
  updateParticipantProfileRequestSchema,
} from '@template/contracts';

export type ParticipantApiConfig = {
  baseUrl?: string;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
};

export type ParticipantApiClient = {
  enabled: boolean;
  getTournaments: () => Promise<Tournament[]>;
  getTournament: (tournamentId: string) => Promise<TournamentDetail>;
  getParticipantProfile: () => Promise<ParticipantProfile>;
  getSupportCenter: () => Promise<SupportCenterResponse>;
  createSupportInquiry: (input: CreateSupportInquiryRequest) => Promise<SupportInquiry>;
  getNotifications: () => Promise<NotificationListResponse>;
  getMyPage: () => Promise<MyPageResponse>;
  getGames: () => Promise<ParticipantGame[]>;
  updateParticipantProfile: (input: UpdateParticipantProfileRequest) => Promise<ParticipantProfile>;
  createTournamentApplication: (input: CreateTournamentApplicationRequest) => Promise<TournamentApplication>;
  getTournamentApplication: (applicationId: string) => Promise<TournamentApplication>;
  requestParticipantSelfCancel: (applicationId: string) => Promise<never>;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

export function createParticipantApiClient(config: ParticipantApiConfig): ParticipantApiClient {
  const fetcher = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl?.trim() ? normalizeBaseUrl(config.baseUrl.trim()) : undefined;
  const bearerToken = config.bearerToken?.trim();
  const enabled = Boolean(baseUrl && bearerToken);

  async function request<T>(path: string, init: RequestInit, parse: (body: unknown) => T): Promise<T> {
    if (!enabled || !baseUrl || !bearerToken) {
      throw new Error('PARTICIPANT_API_NOT_CONFIGURED');
    }

    const response = await fetcher(`${baseUrl}/api${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      const parsedError = participantApiErrorResponseSchema.safeParse(body);
      const fallbackError = participantApiHttpErrorCodeSchema.parse(`PARTICIPANT_API_HTTP_${response.status}`);
      const errorCode = parsedError.success ? parsedError.data.error : fallbackError;
      throw new Error(errorCode);
    }

    return parse(await response.json());
  }

  return {
    enabled,
    getTournaments: () => request('/tournaments', { method: 'GET' }, (body) => tournamentListResponseSchema.parse(body).tournaments),
    getTournament: (tournamentId) => request(`/tournaments/${encodeURIComponent(tournamentId)}`, { method: 'GET' }, (body) => tournamentDetailSchema.parse(body)),
    getParticipantProfile: () => request('/participant/profile', { method: 'GET' }, (body) => participantProfileSchema.parse(body)),
    getSupportCenter: () => request('/participant/support', { method: 'GET' }, (body) => supportCenterResponseSchema.parse(body)),
    createSupportInquiry: (input) => request('/participant/support/inquiries', { method: 'POST', body: JSON.stringify(createSupportInquiryRequestSchema.parse(input)) }, (body) => supportInquirySchema.parse(body)),
    getNotifications: () => request('/participant/notifications', { method: 'GET' }, (body) => notificationListResponseSchema.parse(body)),
    getMyPage: () => request('/participant/mypage', { method: 'GET' }, (body) => myPageResponseSchema.parse(body)),
    getGames: () => request('/participant/games', { method: 'GET' }, (body) => participantGamesResponseSchema.parse(body).games),
    updateParticipantProfile: (input) => request('/participant/profile', { method: 'PATCH', body: JSON.stringify(updateParticipantProfileRequestSchema.parse(input)) }, (body) => participantProfileSchema.parse(body)),
    createTournamentApplication: (input) => request('/tournament-applications', { method: 'POST', body: JSON.stringify(createTournamentApplicationRequestSchema.parse(input)) }, (body) => tournamentApplicationSchema.parse(body)),
    getTournamentApplication: (applicationId) => request(`/tournament-applications/${encodeURIComponent(applicationId)}`, { method: 'GET' }, (body) => tournamentApplicationSchema.parse(body)),
    requestParticipantSelfCancel: (applicationId) => request(`/tournament-applications/${encodeURIComponent(applicationId)}`, { method: 'DELETE' }, () => {
      throw new Error('PARTICIPANT_SELF_CANCEL_UNEXPECTED_SUCCESS');
    }),
  };
}

export function getParticipantApiConfigFromPublicEnv(): ParticipantApiConfig {
  return {
    baseUrl: process.env.EXPO_PUBLIC_API_URL,
  };
}
