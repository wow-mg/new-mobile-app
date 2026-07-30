import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import Home, {
  clearKakaoDevSession,
  CancelCompleteScreen,
  CancelConfirmScreen,
  DuprProfileScreen,
  KakaoAdditionalInfoScreen,
  MyPageScreen,
  NotificationsScreen,
  PartnerAcceptScreen,
  PaymentCompleteScreen,
  PaymentFailureScreen,
  PaymentScreen,
  PrivacyPolicyScreen,
  ReservationHistoryScreen,
  SupportScreen,
  TermsScreen,
  TournamentApplicationScreen,
  TournamentDetailScreen,
  TournamentsScreen,
  getParticipantSnapshot,
  resetParticipantFlow,
  saveParticipantDupr,
  startParticipantSession,
} from '../index';
import { createParticipantApiClient } from '../../participant/api-client';
import { sandboxParticipantSession } from '../../participant/mock-session';

const mockLocalSearchParams = jest.fn(() => ({}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockLocalSearchParams(),
  router: {
    push: jest.fn(),
  },
}));

jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'happickle:///') }));

const mockPush = router.push as jest.Mock;
const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);

describe('Home screen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    openUrlSpy.mockClear();
    mockLocalSearchParams.mockReturnValue({});
    resetParticipantFlow();
    clearKakaoDevSession();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Korean login-first screen with unavailable providers disabled', () => {
    render(<Home />);

    expect(screen.getByTestId('login-artboard')).toBeTruthy();
    expect(screen.getByTestId('login-logo').props.accessibilityLabel).toBe('Happickle');
    expect(screen.getByTestId('login-logo-text')).toHaveTextContent('Happickle');
    expect(screen.getByTestId('login-subtitle')).toHaveTextContent('대한피클볼협회 공식 대회 플랫폼');
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/사업자등록번호: 604-88-01570/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/판매상품: 피클볼 대회 참가권, 레슨 예약, 코트 대관, 행사\/클리닉 참가권/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/서비스 제공기간: 결제일로부터 해당 대회·레슨·대관·행사 종료 시까지 또는 상품별 상세 안내에 따름/);
    expect(screen.getByTestId('kakao-login-button')).toHaveTextContent('카카오로 계속하기');
    expect(screen.getByTestId('kakao-login-button').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('apple-login-button')).toHaveTextContent('Apple로 계속하기');
    expect(screen.getByTestId('apple-login-button').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('social-login-pending-copy')).toHaveTextContent(/설정 키가 아직 전달되지 않았습니다/);
    expect(screen.getByTestId('login-consent-copy')).toHaveTextContent('처음이시면 자동으로 회원가입이 진행돼요');
    expect(screen.queryByTestId('application-cta')).toBeNull();
    expect(screen.queryByText(/Admin Web/i)).toBeNull();
    expect(screen.queryByText(/운영예정기능|안전하게 미리 볼 수 있어요/)).toBeNull();

    fireEvent.press(screen.getByTestId('login-logo'));
    expect(mockPush).toHaveBeenCalledWith('/');

    mockPush.mockClear();
    fireEvent.press(screen.getByTestId('apple-login-button'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reports detected Kakao config without enabling OAuth when no server start URL exists', () => {
    render(<Home socialLoginConfig={{
      kakao: {
        nativeAppKeyConfigured: true,
        restApiKeyConfigured: true,
        javascriptKeyConfigured: true,
      },
      appleConfigured: false,
    }} />);

    expect(screen.getByTestId('social-login-pending-copy')).toHaveTextContent(/서버 OAuth 시작 경로가 아직 없습니다/);
    expect(screen.getByTestId('kakao-login-button').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('apple-login-button').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('enables dev Kakao OAuth when the server initiation URL is configured', () => {
    render(<Home socialLoginConfig={{
      kakao: {
        nativeAppKeyConfigured: true,
        restApiKeyConfigured: true,
        javascriptKeyConfigured: true,
        authStartUrl: 'https://api.example.invalid/auth/kakao',
      },
      appleConfigured: false,
    }} />);

    expect(screen.queryByTestId('social-login-pending-copy')).toBeNull();
    expect(screen.queryByText(/OAuth 확인 경로가 준비되었습니다|dev 환경에서 카카오 로그인 화면|안전하게 미리 볼 수 있어요/)).toBeNull();
    expect(screen.getByTestId('kakao-login-button').props.accessibilityState).toMatchObject({ disabled: false });

    fireEvent.press(screen.getByTestId('kakao-login-button'));
    expect(openUrlSpy).toHaveBeenCalledWith('https://api.example.invalid/auth/kakao?returnTo=happickle%3A%2F%2F%2F');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes the shared header logo to the main route', () => {
    startParticipantSession();
    render(<TournamentsScreen />);

    fireEvent.press(screen.getByTestId('header-logo'));
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('shows additional-info guidance from a Kakao callback response without starting a session', () => {
    render(<Home kakaoCallbackResult={{ action: 'additional_info_required', reason: 'EMAIL_MISSING', continuationToken: '00000000-0000-4000-8000-000000000000', next: '/auth/additional-info' }} />);

    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/필수 정보가 부족/);
    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/추가 정보/);
    expect(screen.queryByTestId('application-cta')).toBeNull();

    fireEvent.press(screen.getByTestId('kakao-additional-info-button'));
    expect(mockPush).toHaveBeenCalledWith('/auth/additional-info?continuationToken=00000000-0000-4000-8000-000000000000');
  });

  it('reads the state-bound Kakao callback from real route parameters', () => {
    mockLocalSearchParams.mockReturnValue({ action: 'additional_info_required', reason: 'EMAIL_MISSING', continuationToken: '00000000-0000-4000-8000-000000000000', next: '/auth/additional-info' });
    render(<Home />);

    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/추가 정보/);
    fireEvent.press(screen.getByTestId('kakao-additional-info-button'));
    expect(mockPush).toHaveBeenCalledWith('/auth/additional-info?continuationToken=00000000-0000-4000-8000-000000000000');
  });

  it('does not trust forged login session values from deep-link parameters', () => {
    mockLocalSearchParams.mockReturnValue({ action: 'login', sessionKind: 'dev-session', memberId: 'forged-member' });
    render(<Home />);

    expect(getParticipantSnapshot()).toMatchObject({ socialSessionStarted: false, persistedKakaoDevSession: null });
    expect(screen.queryByTestId('kakao-dev-session-persistence-copy')).toBeNull();
  });

  it('exchanges a state-bound auth-complete outcome through the Kakao client', async () => {
    const continueAuth = jest.fn().mockResolvedValue({ action: 'login', member: { memberId: 'dev-member-existing', kakaoUserId: 'existing-kakao-id', displayName: '기존회원', status: 'active' }, session: { kind: 'dev-session', accessToken: 'test-only-session-value', memberId: 'dev-member-existing' } });
    mockLocalSearchParams.mockReturnValue({ action: 'auth_complete', outcomeId: '00000000-0000-4000-8000-000000000000' });
    render(<Home kakaoAuthClient={{ completeAdditionalInfo: jest.fn(), continueAuth }} />);
    await waitFor(() => expect(continueAuth).toHaveBeenCalledWith({ outcomeId: '00000000-0000-4000-8000-000000000000' }));
    await waitFor(() => expect(getParticipantSnapshot()).toMatchObject({ socialSessionStarted: true }));
    expect(mockPush).toHaveBeenCalledWith('/tournaments');
  });

  it('shows loading while a state-bound Kakao outcome is being continued', async () => {
    const pendingContinue = new Promise<never>(() => undefined);
    const continueAuth = jest.fn(() => pendingContinue);
    mockLocalSearchParams.mockReturnValue({ action: 'auth_complete', outcomeId: '00000000-0000-4000-8000-000000000000' });

    render(<Home kakaoAuthClient={{ completeAdditionalInfo: jest.fn(), continueAuth }} />);

    expect(await screen.findByTestId('kakao-auth-continuation-status')).toHaveTextContent(/로그인을 완료하고 있어요/);
    expect(getParticipantSnapshot()).toMatchObject({ socialSessionStarted: false, persistedKakaoDevSession: null });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('surfaces a safe error and does not start a session when Kakao continuation fails', async () => {
    const continueAuth = jest.fn().mockRejectedValue(new Error('AUTH_OUTCOME_NOT_PENDING'));
    mockLocalSearchParams.mockReturnValue({ action: 'auth_complete', outcomeId: '00000000-0000-4000-8000-000000000000' });

    render(<Home kakaoAuthClient={{ completeAdditionalInfo: jest.fn(), continueAuth }} />);

    expect(await screen.findByTestId('kakao-auth-continuation-status')).toHaveTextContent(/만료.*다시/);
    expect(screen.getByTestId('kakao-auth-continuation-status')).not.toHaveTextContent('AUTH_OUTCOME_NOT_PENDING');
    expect(getParticipantSnapshot()).toMatchObject({ socialSessionStarted: false, persistedKakaoDevSession: null });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes a continued Kakao signup to signup completion', async () => {
    const continueAuth = jest.fn().mockResolvedValue({ action: 'signup', member: { memberId: 'dev-member-new', kakaoUserId: 'new-kakao-id', displayName: '신규회원', status: 'active' }, session: { kind: 'dev-session', accessToken: 'test-only-session-value', memberId: 'dev-member-new' } });
    mockLocalSearchParams.mockReturnValue({ action: 'auth_complete', outcomeId: '00000000-0000-4000-8000-000000000000' });

    render(<Home kakaoAuthClient={{ completeAdditionalInfo: jest.fn(), continueAuth }} />);

    await waitFor(() => expect(getParticipantSnapshot()).toMatchObject({ socialSessionStarted: true, persistedKakaoDevSession: { action: 'signup', memberId: 'dev-member-new', displayName: '신규회원' } }));
    expect(mockPush).toHaveBeenCalledWith('/signup-complete');
  });

  it('submits Kakao additional info and starts the returned dev session', async () => {
    const completeAdditionalInfo = jest.fn().mockResolvedValue({
      action: 'signup',
      member: { memberId: 'dev-member-777', kakaoUserId: '777', email: 'member@example.invalid', displayName: '김카카오', status: 'active' },
      session: { kind: 'dev-session', accessToken: 'test-only-session-value', memberId: 'dev-member-777' },
    });
    render(<KakaoAdditionalInfoScreen continuationToken="00000000-0000-4000-8000-000000000000" completeAdditionalInfo={completeAdditionalInfo} />);

    expect(screen.getByTestId('kakao-additional-info-screen')).toBeTruthy();
    expect(screen.getByTestId('kakao-additional-info-submit-button').props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(screen.getByTestId('kakao-additional-email-input'), 'member@example.invalid');
    fireEvent.changeText(screen.getByTestId('kakao-additional-name-input'), '김카카오');
    fireEvent.changeText(screen.getByTestId('kakao-additional-phone-input'), '010-1234-5678');

    expect(screen.getByTestId('kakao-additional-info-submit-button').props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(screen.getByTestId('kakao-additional-info-submit-button'));
    await waitFor(() => expect(completeAdditionalInfo).toHaveBeenCalledWith({ continuationToken: '00000000-0000-4000-8000-000000000000', email: 'member@example.invalid', displayName: '김카카오', phone: '010-1234-5678' }));
    await waitFor(() => expect(getParticipantSnapshot()).toMatchObject({ socialSessionStarted: true, persistedKakaoDevSession: { action: 'signup', memberId: 'dev-member-777', displayName: '김카카오' } }));
    expect(mockPush).toHaveBeenCalledWith('/signup-complete');
  });

  it('keeps the Kakao additional-info form on screen when completion fails', async () => {
    const completeAdditionalInfo = jest.fn().mockRejectedValue(new Error('DUPLICATE_EMAIL'));
    render(<KakaoAdditionalInfoScreen continuationToken="00000000-0000-4000-8000-000000000000" completeAdditionalInfo={completeAdditionalInfo} />);

    fireEvent.changeText(screen.getByTestId('kakao-additional-email-input'), 'member@example.invalid');
    fireEvent.changeText(screen.getByTestId('kakao-additional-name-input'), '김카카오');
    fireEvent.press(screen.getByTestId('kakao-additional-info-submit-button'));

    await waitFor(() => expect(screen.getByTestId('kakao-additional-info-status')).toHaveTextContent(/이미 가입된 이메일/));
    expect(mockPush).not.toHaveBeenCalledWith('/signup-complete');
  });

  it('shows duplicate-account Kakao callback guidance without exposing provider details', () => {
    render(<Home kakaoCallbackResult={{ action: 'blocked', reason: 'DUPLICATE_EMAIL', message: '이미 가입된 이메일입니다.' }} />);

    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/이미 가입된 이메일/);
    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/기존 계정/);
    expect(screen.getByTestId('kakao-callback-result-copy')).not.toHaveTextContent(/access_token|client_id|REST/i);
  });

  it('shows duplicate-phone Kakao guidance with Korean recovery copy', () => {
    render(<Home kakaoCallbackResult={{ action: 'blocked', reason: 'DUPLICATE_PHONE', message: '이미 가입된 연락처입니다.' }} />);

    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/이미 가입된 연락처/);
    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/1:1 문의/);
    expect(screen.getByTestId('kakao-callback-result-copy')).not.toHaveTextContent(/access_token|client_id|REST/i);
  });

  it('shows withdrawn-member Kakao guidance without starting a session', () => {
    render(<Home kakaoCallbackResult={{ action: 'blocked', reason: 'WITHDRAWN_MEMBER', message: '탈퇴 처리된 계정은 재가입 정책 확인 후 이용할 수 있습니다.' }} />);

    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/탈퇴 처리된 계정/);
    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/재가입 가능 여부/);
    expect(screen.queryByTestId('application-cta')).toBeNull();
  });

  it('persists a sanitized Kakao dev-session callback across a local app restart', () => {
    render(<Home kakaoCallbackResult={{ action: 'signup', member: { memberId: 'member_local_001', kakaoUserId: 'kakao-local-001', displayName: '김카카오', status: 'active' }, session: { kind: 'dev-session', accessToken: 'test-only-session-value', memberId: 'member_local_001' } }} />);

    expect(screen.getByTestId('kakao-callback-result-copy')).toHaveTextContent(/카카오 가입이 확인되었습니다/);
    expect(screen.getByTestId('kakao-callback-result-copy')).not.toHaveTextContent(/dev 세션|대회 둘러보기/);
    expect(screen.getByTestId('kakao-dev-session-persistence-copy')).toHaveTextContent(/앱 재시작 후에도/);

    resetParticipantFlow();
    expect(getParticipantSnapshot()).toMatchObject({ socialSessionStarted: true, persistedKakaoDevSession: { action: 'signup', memberId: 'member_local_001', displayName: '김카카오' } });
  });

  it('uses route targets from the tournament list page', () => {
    startParticipantSession();
    render(<TournamentsScreen />);

    expect(screen.getByTestId('header-logo')).toHaveStyle({ height: 40, width: 126 });
    expect(screen.getByTestId('header-bell')).toBeTruthy();
    expect(screen.getByTestId('explore-home')).toHaveTextContent(/어떤 대회에 나가볼까요/);
    expect(screen.getByTestId('participant-api-mode')).toHaveTextContent('총 4개');
    expect(screen.getByTestId('mock-tournament-card')).toHaveTextContent(/2026 주말 한강리그 남자복식 2.5/);
    expect(screen.getAllByTestId('api-tournament-card')).toHaveLength(3);
    expect(screen.getByText('2026 주중 한강리그 혼합복식')).toBeTruthy();
    expect(screen.getAllByText(/팀당 60,000원/)).toHaveLength(4);
    expect(screen.getAllByTestId('court-preview')).toHaveLength(4);
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
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/\(주\) 와우매니지먼트그룹/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/사업자등록번호: 604-88-01570/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/대표번호: 02-570-1900/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/판매상품: 피클볼 대회 참가권, 레슨 예약, 코트 대관, 행사\/클리닉 참가권/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/서비스 제공기간: 결제일로부터 해당 대회·레슨·대관·행사 종료 시까지 또는 상품별 상세 안내에 따름/);

    fireEvent.press(screen.getByTestId('mypage-privacy-link'));
    expect(mockPush).toHaveBeenLastCalledWith('/privacy-policy');

    fireEvent.press(screen.getByTestId('mypage-terms-link'));
    expect(mockPush).toHaveBeenLastCalledWith('/terms');

    fireEvent.press(screen.getByTestId('mypage-support-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/support');

    fireEvent.press(screen.getByTestId('mypage-dupr-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/dupr-profile');
  });

  it('renders the privacy policy publicly without starting a participant session', () => {
    render(<PrivacyPolicyScreen />);
    expect(screen.getByTestId('privacy-policy-draft-notice')).toHaveTextContent(/검토 중인 초안.*게시된 방침이 아닙니다/);
    expect(screen.getByTestId('privacy-policy-screen')).toHaveTextContent(/\(주\) 와우매니지먼트그룹/);
    expect(screen.getByTestId('privacy-policy-screen')).toHaveTextContent(/개인정보처리방침 담당자: 홍승표/);
    expect(screen.getByTestId('privacy-policy-screen')).toHaveTextContent(/개인정보 보호법/);
    expect(screen.getByTestId('privacy-policy-screen')).toHaveTextContent(/성별/);
    expect(screen.getByTestId('privacy-policy-screen')).toHaveTextContent(/연령대/);
    expect(screen.getByTestId('privacy-policy-screen')).toHaveTextContent(/생일/);
    expect(screen.getByTestId('privacy-policy-screen')).toHaveTextContent(/출생 연도/);
    expect(screen.getByTestId('privacy-policy-screen')).toHaveTextContent(/선택적으로 수집/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/판매상품: 피클볼 대회 참가권, 레슨 예약, 코트 대관, 행사\/클리닉 참가권/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/서비스 제공기간: 결제일로부터 해당 대회·레슨·대관·행사 종료 시까지 또는 상품별 상세 안내에 따름/);
    expect(screen.queryByTestId('login-artboard')).toBeNull();
  });

  it('renders the terms page publicly without starting a participant session', () => {
    render(<TermsScreen />);
    expect(screen.getByTestId('terms-draft-notice')).toHaveTextContent(/검토 중인 초안.*게시된 약관이 아닙니다/);
    expect(screen.getByTestId('terms-screen')).toHaveTextContent(/\(주\) 와우매니지먼트그룹/);
    expect(screen.getByTestId('terms-screen')).toHaveTextContent(/주소: 서울특별시 강남구 도산대로46길 21, 비132호\(논현동, 한진로즈힐아파트\)/);
    expect(screen.getByTestId('terms-screen')).toHaveTextContent(/이 용 약 관/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/판매상품: 피클볼 대회 참가권, 레슨 예약, 코트 대관, 행사\/클리닉 참가권/);
    expect(screen.getByTestId('company-legal-footer')).toHaveTextContent(/서비스 제공기간: 결제일로부터 해당 대회·레슨·대관·행사 종료 시까지 또는 상품별 상세 안내에 따름/);
    expect(screen.queryByTestId('login-artboard')).toBeNull();
  });

  it('renders support copy on the support route', () => {
    startParticipantSession();
    render(<SupportScreen />);

    expect(screen.getByTestId('support-readiness-notice')).toHaveTextContent(/개발·스테이징.*운영자가 확인/);
    expect(screen.getByTestId('support-copy')).toHaveTextContent(/1:1 문의로 접수/);
    expect(screen.getByTestId('support-copy')).toHaveTextContent(/참가자 직접 취소\/환불은 1:1 문의/);
    expect(screen.getByText(/support@happickle\.kr \(1:1 문의 접수용\)/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('support-reservations-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/reservation-history');
    fireEvent.press(screen.getByTestId('support-terms-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/terms');
    fireEvent.press(screen.getByTestId('support-privacy-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/privacy-policy');
  });

  it('shows operator-managed application, payment, and refund readiness without implying a live flow', () => {
    startParticipantSession();
    render(<PaymentScreen />);

    expect(screen.getByTestId('payment-readiness-notice')).toHaveTextContent(/실시간 PG.*사용하지 않습니다/);
    expect(screen.getByTestId('payment-readiness-notice')).toHaveTextContent(/백엔드.*운영자 확인 상태/);
    expect(screen.queryByText(/결제가 완료되었어요/)).toBeNull();
  });

  it('refreshes the backend operator-managed payment record after application without calling payment-provider routes', async () => {
    let applicationCreated = false;
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/tournaments')) {
        return { ok: true, status: 200, json: async () => ({ tournaments: [sandboxParticipantSession.featuredTournament] }) } as Response;
      }
      if (url.endsWith('/api/participant/profile') && init?.method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ ...sandboxParticipantSession.profile, duprId: 'DUPR-12345', duprStatus: 'selfReportedPendingOperatorReview' }) } as Response;
      }
      if (url.endsWith('/api/participant/profile') && init?.method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ ...sandboxParticipantSession.profile, duprId: 'DUPR-12345', duprStatus: 'selfReportedPendingOperatorReview' }) } as Response;
      }
      if (url.endsWith('/api/tournament-applications') && init?.method === 'POST') {
        applicationCreated = true;
        return { ok: true, status: 201, json: async () => ({
          applicationId: 'application-api-bridge',
          tournamentId: sandboxParticipantSession.featuredTournament.tournamentId,
          participantId: sandboxParticipantSession.profile.participantId,
          duprId: 'DUPR-12345',
          divisionId: 'division_sandbox_mixed_35',
          status: 'submitted',
          submittedAt: '2026-07-28T14:00:00.000Z',
          supportChannel: 'oneToOneInquiry',
          paymentStatus: 'notStartedSandbox',
          refundPolicy: 'participantSelfCancelDisabled',
        }) } as Response;
      }
      if (url.endsWith('/api/tournament-applications/application-api-bridge')) {
        return { ok: true, status: 200, json: async () => ({
          applicationId: 'application-api-bridge',
          tournamentId: sandboxParticipantSession.featuredTournament.tournamentId,
          participantId: sandboxParticipantSession.profile.participantId,
          duprId: 'DUPR-12345',
          divisionId: 'division_sandbox_mixed_35',
          status: 'submitted',
          submittedAt: '2026-07-28T14:00:00.000Z',
          supportChannel: 'oneToOneInquiry',
          paymentStatus: 'notStartedSandbox',
          refundPolicy: 'participantSelfCancelDisabled',
        }) } as Response;
      }
      if (url.endsWith('/api/participant/mypage')) {
        return { ok: true, status: 200, json: async () => ({
          profile: { ...sandboxParticipantSession.profile, duprId: 'DUPR-12345', duprStatus: 'selfReportedPendingOperatorReview' },
          applications: applicationCreated ? [{
            applicationId: 'application-api-bridge',
            tournamentId: sandboxParticipantSession.featuredTournament.tournamentId,
            participantId: sandboxParticipantSession.profile.participantId,
            duprId: 'DUPR-12345',
            divisionId: 'division_sandbox_mixed_35',
            status: 'submitted',
            submittedAt: '2026-07-28T14:00:00.000Z',
            supportChannel: 'oneToOneInquiry',
            paymentStatus: 'notStartedSandbox',
            refundPolicy: 'participantSelfCancelDisabled',
          }] : [],
          paymentRecords: applicationCreated ? [{
            paymentRecordId: 'receipt-operator-managed-001',
            applicationId: 'application-api-bridge',
            participantId: sandboxParticipantSession.profile.participantId,
            amountKrw: 60000,
            paymentMode: 'operatorManagedOffline',
            status: 'operatorReview',
            operatorNote: '운영자 입금 확인 대기',
            recordedAt: '2026-07-28T14:00:00.000Z',
          }] : [],
        }) } as Response;
      }
      throw new Error(`unexpected endpoint: ${url}`);
    });
    const apiClient = createParticipantApiClient({
      baseUrl: 'https://api.example.invalid',
      bearerToken: 'test-only-session',
      applicationBridgeOnly: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    resetParticipantFlow(apiClient);
    startParticipantSession();
    saveParticipantDupr('DUPR-12345');
    render(<><TournamentApplicationScreen /><PaymentScreen /></>);
    await waitFor(() => expect(fetchImpl.mock.calls.some(([url, init]) =>
      String(url).endsWith('/api/participant/profile') && init?.method === 'PATCH',
    )).toBe(true));
    fetchImpl.mockClear();

    fireEvent.press(screen.getByTestId('application-cta'));

    await waitFor(() => expect(getParticipantSnapshot().paymentRecords[0]).toMatchObject({
      paymentRecordId: 'receipt-operator-managed-001',
      paymentMode: 'operatorManagedOffline',
      status: 'operatorReview',
    }));
    await waitFor(() => expect(getParticipantSnapshot().routeStatus.mypage).toBe('ready'));

    expect(screen.getByTestId('payment-backend-status')).toHaveTextContent(/운영자 확인 중/);
    expect(screen.getByTestId('payment-record-reference')).toHaveTextContent(/receipt-operator-managed-001/);
    expect(fetchImpl.mock.calls.map(([url, init]) => [
      init?.method ?? 'GET',
      new URL(String(url)).pathname,
    ])).toEqual([
      ['POST', '/api/tournament-applications'],
      ['GET', '/api/tournament-applications/application-api-bridge'],
      ['GET', '/api/participant/mypage'],
    ]);

    fetchImpl.mockClear();
    fireEvent.press(screen.getByTestId('payment-status-refresh'));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl.mock.calls.map(([url, init]) => [
      init?.method ?? 'GET',
      new URL(String(url)).pathname,
    ])).toEqual([['GET', '/api/participant/mypage']]);
  });

  it('shows application, payment, and refund as operator-confirmed reservation states', () => {
    startParticipantSession();
    render(<ReservationHistoryScreen />);
    expect(screen.getByTestId('reservation-status-notice')).toHaveTextContent(/신청 접수.*결제.*환불.*운영자 확인/);
  });

  it('keeps reachable payment and refund terminal routes in operator-review status', () => {
    startParticipantSession();
    render(<PaymentCompleteScreen />);
    expect(screen.getByTestId('payment-complete-hero')).toHaveTextContent(/운영자 결제 확인 상태/);
    expect(screen.getByTestId('payment-complete-hero')).not.toHaveTextContent(/결제가 완료|신청이 확정/);
    expect(screen.queryByText(/카드결제 \(PG\)/)).toBeNull();

    cleanup();
  });

  it('shows cancellation as an operator-handled request rather than a completed refund', () => {
    startParticipantSession();
    render(<CancelCompleteScreen />);
    expect(screen.getByTestId('cancel-complete-hero')).toHaveTextContent(/취소·환불 요청 접수/);
    expect(screen.getByTestId('cancel-complete-hero')).not.toHaveTextContent(/취소가 완료|환불은.*이내 처리/);
    expect(screen.queryByText(/카드결제 \(PG\)|영업일 기준 3~5일/)).toBeNull();
  });

  it('keeps cancel confirmation operator-managed without refund timing promises', () => {
    startParticipantSession();
    render(<CancelConfirmScreen />);
    expect(screen.getAllByText(/운영자.*확인/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/카드결제 \(PG\)|영업일 기준 3~5일|되돌릴 수 없|환불 예정 금액|100% 환불 대상/)).toBeNull();
  });

  it('routes retry and partner acceptance to operator-managed payment guidance', () => {
    startParticipantSession();
    render(<PaymentFailureScreen />);
    expect(screen.getByTestId('payment-failure-hero')).toHaveTextContent(/앱 내 결제 기능은 연결되지 않았습니다/);
    fireEvent.press(screen.getByTestId('payment-failure-retry-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/payment');

    cleanup();
  });

  it('routes partner acceptance to payment guidance without claiming completion', () => {
    startParticipantSession();
    render(<PartnerAcceptScreen />);
    fireEvent.press(screen.getByTestId('partner-accept-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/payment');
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

    await waitFor(() => expect(screen.getByTestId('participant-api-mode')).toHaveTextContent('총 4개'));
    expect(screen.getByTestId('mock-tournament-card')).toHaveTextContent(/2026 주말 한강리그 남자복식 2.5/);
    expect(screen.getAllByTestId('api-tournament-card')).toHaveLength(3);
    expect(screen.getByText('2026 주중 한강리그 혼합복식')).toBeTruthy();
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
