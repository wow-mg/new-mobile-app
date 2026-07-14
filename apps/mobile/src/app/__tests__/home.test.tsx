import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import Home, {
  DuprProfileScreen,
  MyPageScreen,
  NotificationsScreen,
  SupportScreen,
  TournamentApplicationScreen,
  TournamentDetailScreen,
  TournamentsScreen,
  resetParticipantFlow,
  saveParticipantDupr,
  startParticipantSession,
} from '../index';
import { createParticipantApiClient } from '../../participant/api-client';
import { sandboxParticipantSession } from '../../participant/mock-session';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

const mockPush = router.push as jest.Mock;

describe('Home screen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    resetParticipantFlow();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Korean login-first screen and routes social login to tournaments', () => {
    render(<Home />);

    expect(screen.getByTestId('login-artboard')).toBeTruthy();
    expect(screen.getByTestId('login-logo').props.accessibilityLabel).toBe('Happickle');
    expect(screen.getByTestId('login-logo-text')).toHaveTextContent('Happickle');
    expect(screen.getByTestId('login-subtitle')).toHaveTextContent('대한피클볼협회 공식 대회 플랫폼');
    expect(screen.getByTestId('kakao-login-button')).toHaveTextContent('카카오로 계속하기');
    expect(screen.getByTestId('apple-login-button')).toHaveTextContent('Apple로 계속하기');
    expect(screen.getByTestId('login-consent-copy')).toHaveTextContent('처음이시면 자동으로 회원가입이 진행돼요');
    expect(screen.queryByTestId('application-cta')).toBeNull();
    expect(screen.queryByText(/Admin Web/i)).toBeNull();

    fireEvent.press(screen.getByTestId('apple-login-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/tournaments');
  });

  it('uses route targets from the tournament list page', () => {
    startParticipantSession();
    render(<TournamentsScreen />);

    expect(screen.getByTestId('header-logo')).toHaveStyle({ height: 40, width: 126 });
    expect(screen.getByTestId('header-bell')).toBeTruthy();
    expect(screen.getByTestId('explore-home')).toHaveTextContent(/어떤 대회에 나가볼까요/);
    expect(screen.getByTestId('participant-api-mode')).toHaveTextContent('총 1개');
    expect(screen.getByTestId('court-preview')).toBeTruthy();
    expect(screen.queryByTestId('participant-route-state')).toBeNull();

    fireEvent.press(screen.getByTestId('mock-tournament-card'));
    expect(mockPush).toHaveBeenLastCalledWith(`/tournaments/${sandboxParticipantSession.featuredTournament.tournamentId}`);

    fireEvent.press(screen.getByTestId('go-support-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/support');

    fireEvent.press(screen.getByTestId('go-dupr-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/dupr-profile');
  });

  it('routes tournament detail application CTA through the DUPR gate', () => {
    startParticipantSession();
    render(<TournamentDetailScreen />);

    expect(screen.getByTestId('detail-layout-hero')).toHaveTextContent(/대회 상세/);
    expect(screen.getByText('대회요강')).toBeTruthy();
    expect(screen.getByText('환불 규정')).toBeTruthy();
    expect(screen.getByText('신청 가능한 부문')).toBeTruthy();
    expect(screen.getAllByTestId('division-option')[0]).toHaveTextContent(/DUPR 등록 후 신청 가능/);
    expect(screen.getAllByTestId('division-option')[0]).toHaveTextContent(/운영자 확인 후 오프라인 결제 안내/);
    fireEvent.press(screen.getByTestId('detail-apply-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/dupr-profile');
  });

  it('saves DUPR and routes back to the tournament application URL', () => {
    startParticipantSession();
    render(<DuprProfileScreen />);

    expect(screen.getByTestId('dupr-layout-hero')).toHaveTextContent(/참가 신청 전 DUPR 정보가 필요해요/);
    fireEvent.changeText(screen.getByTestId('dupr-input'), 'DUPR-12345');
    fireEvent.press(screen.getByTestId('save-dupr-button'));
    expect(screen.getByTestId('saved-dupr')).toHaveTextContent('현재 DUPR DUPR-12345 · 관리자 확인중');
    expect(screen.getByTestId('dupr-layout-hero')).toHaveTextContent(/현재 DUPR 저장됨/);

    fireEvent.press(screen.getByTestId('dupr-continue-application'));
    expect(mockPush).toHaveBeenLastCalledWith(`/tournaments/${sandboxParticipantSession.featuredTournament.tournamentId}/apply`);
  });

  it('submits a mock application only after DUPR is present', () => {
    startParticipantSession();
    saveParticipantDupr('DUPR-12345');
    render(<TournamentApplicationScreen />);

    expect(screen.getByTestId('application-division-summary')).toHaveTextContent(/기본 선택 부문/);
    expect(screen.getByTestId('application-division-summary')).toHaveTextContent(/DUPR 등록 후 신청 가능/);
    expect(screen.getByTestId('application-division-summary')).toHaveTextContent(/운영자 확인 후 오프라인 결제 안내/);
    expect(screen.getByTestId('application-cta').props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(screen.getByTestId('application-cta'));
    expect(screen.getByTestId('application-submitted')).toHaveTextContent(/참가 신청 접수 완료/);
    expect(screen.getByTestId('application-submitted')).not.toHaveTextContent(/application_tournament/);
    expect(screen.getByTestId('application-submitted')).toHaveTextContent(/접수 부문 혼합복식/);
    expect(screen.getByTestId('application-submitted')).toHaveTextContent(/참가자 직접 취소 불가 · 1:1 문의/);
  });

  it('opens bottom tabs and my page shortcuts through route pushes', () => {
    startParticipantSession();
    render(<TournamentsScreen />);

    fireEvent.press(screen.getByTestId('bottom-tab-games'));
    expect(mockPush).toHaveBeenLastCalledWith('/games');

    fireEvent.press(screen.getByTestId('bottom-tab-notifications'));
    expect(mockPush).toHaveBeenLastCalledWith('/notifications');

    fireEvent.press(screen.getByTestId('bottom-tab-mypage'));
    expect(mockPush).toHaveBeenLastCalledWith('/mypage');
  });

  it('routes my page shortcuts to support and DUPR profile', () => {
    startParticipantSession();
    render(<MyPageScreen />);

    expect(screen.getByTestId('mypage-layout-hero')).toHaveTextContent(/관리하세요/);
    fireEvent.press(screen.getByTestId('mypage-support-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/support');

    fireEvent.press(screen.getByTestId('mypage-dupr-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/dupr-profile');
  });

  it('renders support copy on the support route', () => {
    startParticipantSession();
    render(<SupportScreen />);

    expect(screen.getByTestId('support-copy')).toHaveTextContent(/1:1 문의로 접수/);
    expect(screen.getByTestId('support-copy')).toHaveTextContent(/참가자 직접 취소\/환불은 1:1 문의/);
    expect(screen.getByText(/support@happickle\.kr \(1:1 문의 접수용\)/)).toBeTruthy();
  });

  it('uses the login reference dark surround, white artboard, and social button colors', () => {
    render(<Home />);

    expect(screen.getByTestId('login-artboard')).toHaveStyle({ backgroundColor: '#f7faf8', maxWidth: 480 });
    expect(screen.getByTestId('login-illustration')).toHaveStyle({ backgroundColor: '#e9f1ea', borderRadius: 42 });
    expect(screen.getByTestId('kakao-login-button')).toHaveStyle({ backgroundColor: '#fee500', borderRadius: 14 });
    expect(screen.getByTestId('apple-login-button')).toHaveStyle({ backgroundColor: '#1f2937', borderRadius: 14 });
  });

  it('exercises the participant API client from the UI when injected/enabled', async () => {
    const apiClient = createParticipantApiClient({
      baseUrl: 'https://api.example.invalid',
      bearerToken: 'test-token',
      fetchImpl: jest.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (url.endsWith('/api/tournaments')) return { ok: true, status: 200, json: async () => ({ tournaments: [{ tournamentId: 'tournament_api_001', title: 'API Open', division: 'Mixed Doubles', location: 'API Court', startsAt: '2026-08-09T00:00:00.000Z', applicationStatus: 'available', requiresDupr: true, paymentMode: 'operatorManagedOffline', cancellationPolicy: 'operatorSupportOnly' }] }) } as Response;
        if (url.endsWith('/api/participant/profile') && init?.method === 'GET') return { ok: true, status: 200, json: async () => ({ participantId: 'participant_api_001', displayName: 'API Player', duprStatus: 'missing', supportChannel: 'oneToOneInquiry' }) } as Response;
        return { ok: true, status: 200, json: async () => ({ ...body, participantId: 'participant_api_001', displayName: 'API Player', duprStatus: 'selfReportedPendingOperatorReview', supportChannel: 'oneToOneInquiry' }) } as Response;
      }) as unknown as typeof fetch,
    });

    resetParticipantFlow(apiClient);
    startParticipantSession();
    render(<TournamentsScreen />);

    await waitFor(() => expect(screen.getByTestId('participant-api-mode')).toHaveTextContent('총 1개'));
    expect(screen.getByTestId('mock-tournament-card')).toHaveTextContent(/API Open/);
  });

  it('shows a Korean API fallback label when participant API calls fail', async () => {
    const apiClient = createParticipantApiClient({
      baseUrl: 'https://api.example.invalid',
      bearerToken: 'test-token',
      fetchImpl: jest.fn(async () => { throw new Error('network unavailable'); }) as unknown as typeof fetch,
    });

    resetParticipantFlow(apiClient);
    startParticipantSession();
    render(<TournamentsScreen />);

    await waitFor(() => expect(screen.getByTestId('participant-api-mode')).toHaveTextContent('총 1개'));
    expect(screen.getByTestId('mock-tournament-card')).toHaveTextContent(/PickleHub Open/);
  });

  it('marks utility routes independently when my page hydration degrades', async () => {
    const apiClient = createParticipantApiClient({
      baseUrl: 'https://api.example.invalid',
      bearerToken: 'test-token',
      fetchImpl: jest.fn(async (url: string) => {
        if (url.endsWith('/api/tournaments')) return { ok: true, status: 200, json: async () => ({ tournaments: [sandboxParticipantSession.featuredTournament] }) } as Response;
        if (url.endsWith('/api/participant/profile')) return { ok: true, status: 200, json: async () => sandboxParticipantSession.profile } as Response;
        if (url.endsWith('/api/participant/support')) return { ok: true, status: 200, json: async () => ({ policyCopy: 'API 고객센터 응답', contactEmail: 'support@happickle.kr', operatingHours: '평일 10:00 ~ 18:00', inquiries: [] }) } as Response;
        if (url.endsWith('/api/participant/notifications')) return { ok: true, status: 200, json: async () => ({ notifications: [] }) } as Response;
        throw new Error('mypage unavailable');
      }) as unknown as typeof fetch,
    });

    resetParticipantFlow(apiClient);
    startParticipantSession();
    render(<MyPageScreen />);

    await waitFor(() => expect(screen.getByTestId('participant-route-state')).toHaveTextContent('일부 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'));
    expect(screen.getByTestId('mypage-payment-status')).toHaveTextContent('결제 내역 없음 · 오프라인 결제는 운영자 확인 대기');
  });

  it('shows an empty notifications state after API hydration returns no notifications', async () => {
    const apiClient = createParticipantApiClient({
      baseUrl: 'https://api.example.invalid',
      bearerToken: 'test-token',
      fetchImpl: jest.fn(async (url: string) => {
        if (url.endsWith('/api/tournaments')) return { ok: true, status: 200, json: async () => ({ tournaments: [sandboxParticipantSession.featuredTournament] }) } as Response;
        if (url.endsWith('/api/participant/profile')) return { ok: true, status: 200, json: async () => sandboxParticipantSession.profile } as Response;
        if (url.endsWith('/api/participant/support')) return { ok: true, status: 200, json: async () => ({ policyCopy: 'API 고객센터 응답', contactEmail: 'support@happickle.kr', operatingHours: '평일 10:00 ~ 18:00', inquiries: [] }) } as Response;
        if (url.endsWith('/api/participant/notifications')) return { ok: true, status: 200, json: async () => ({ notifications: [] }) } as Response;
        if (url.endsWith('/api/participant/mypage')) return { ok: true, status: 200, json: async () => ({ profile: sandboxParticipantSession.profile, applications: [], paymentRecords: [] }) } as Response;
        if (url.endsWith('/api/participant/games')) return { ok: true, status: 200, json: async () => ({ games: [] }) } as Response;
        throw new Error('unexpected endpoint');
      }) as unknown as typeof fetch,
    });

    resetParticipantFlow(apiClient);
    startParticipantSession();
    render(<NotificationsScreen />);

    await waitFor(() => expect(screen.getByTestId('notifications-empty')).toHaveTextContent(/아직 표시할 알림이 없습니다/));
  });
});
