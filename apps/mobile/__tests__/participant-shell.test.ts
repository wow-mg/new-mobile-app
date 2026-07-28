import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { participantApplicationErrorCodeSchema } from '@template/contracts';
import { router } from 'expo-router';
import Home, {
  CancelCompleteScreen,
  CancelConfirmScreen,
  BracketScreen,
  DuprProfileScreen,
  GamesScreen,
  InviteDetailScreen,
  InviteExpiredScreen,
  FinalResultsScreen,
  MyPageScreen,
  NotificationsScreen,
  PartnerAcceptScreen,
  PartnerDeclinedScreen,
  PaymentCompleteScreen,
  PaymentFailureScreen,
  PaymentScreen,
  ResultConfirmScreen,
  DisputeCompleteScreen,
  DisputeScreen,
  ScoreEntryScreen,
  SignupCompleteScreen,
  SignupScreen,
  NotificationSettingsScreen,
  AccountWithdrawalScreen,
  ProfileEditScreen,
  ReservationHistoryScreen,
  SupportScreen,
  TournamentApplicationScreen,
  TournamentsScreen,
  resetParticipantFlow,
  saveParticipantDupr,
  startParticipantSession,
} from '../src/app';
import {
  REQUIRED_DUPR_ERROR,
  hasRequiredDupr,
  sandboxParticipantSession,
  saveSandboxDupr,
  describeApplicationPolicy,
  describeSupportRefundPolicyCopy,
  submitSandboxTournamentApplication,
} from '../src/participant/mock-session';
import type { ParticipantApiClient } from '../src/participant/api-client';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({})),
  router: {
    push: jest.fn(),
  },
}));

const mockPush = router.push as jest.Mock;

describe('participant shell sandbox contract', () => {
  beforeEach(() => {
    mockPush.mockClear();
    resetParticipantFlow();
  });

  afterEach(() => {
    cleanup();
  });

  it('uses a participant social session actor shape', () => {
    expect(sandboxParticipantSession.sessionActor).toMatchObject({
      actorId: expect.any(String),
      role: 'participant',
      participantId: expect.any(String),
      scopes: expect.arrayContaining([
        'participant:profile:read',
        'participant:profile:update',
        'participant:application:create',
      ]),
      sessionId: expect.any(String),
      issuedAt: expect.any(String),
    });
  });

  it('blocks application readiness when DUPR ID is missing', () => {
    expect(hasRequiredDupr(sandboxParticipantSession.profile)).toBe(false);
    expect(REQUIRED_DUPR_ERROR).toBe(participantApplicationErrorCodeSchema.enum.DUPR_PROFILE_REQUIRED);
    expect(() =>
      submitSandboxTournamentApplication({
        profile: sandboxParticipantSession.profile,
        tournament: sandboxParticipantSession.featuredTournament,
      }),
    ).toThrow(REQUIRED_DUPR_ERROR);
  });

  it('unlocks readiness and creates a local-only mock application when DUPR ID is present', () => {
    expect(hasRequiredDupr({ duprId: '  ' })).toBe(false);

    const readyProfile = saveSandboxDupr(sandboxParticipantSession.profile, ' dupr-12345 ');
    expect(readyProfile.duprId).toBe('DUPR-12345');
    expect(hasRequiredDupr(readyProfile)).toBe(true);

    expect(
      submitSandboxTournamentApplication({
        profile: readyProfile,
        tournament: sandboxParticipantSession.featuredTournament,
        submittedAt: '2026-07-08T01:00:00.000Z',
      }),
    ).toMatchObject({
      tournamentId: sandboxParticipantSession.featuredTournament.tournamentId,
      participantId: readyProfile.participantId,
      duprId: 'DUPR-12345',
      status: 'submitted',
      supportChannel: 'oneToOneInquiry',
      paymentStatus: 'notStartedSandbox',
      refundPolicy: 'participantSelfCancelDisabled',
    });
  });


  it('maps API-returned refund and support policy to shared application and FAQ copy', () => {
    const policy = {
      refundPolicy: 'participantSelfCancelDisabled',
      supportChannel: 'oneToOneInquiry',
    } as const;

    expect(describeApplicationPolicy(policy)).toBe('참가자 직접 취소 불가 · 1:1 문의');
    expect(describeSupportRefundPolicyCopy(policy)).toContain(describeApplicationPolicy(policy));
    expect(describeSupportRefundPolicyCopy(policy)).toContain('참가자 직접 취소/환불은 1:1 문의로 운영자가 확인합니다.');
    expect(describeSupportRefundPolicyCopy(policy)).toContain('DUPR 정보는 어디서 확인하나요?');
  });

  it('starts on the Korean social-login screen before showing participant application gates', () => {
    render(React.createElement(Home));

    expect(screen.getByTestId('login-artboard')).toBeTruthy();
    expect(screen.getByTestId('login-logo').props.accessibilityLabel).toBe('Happickle');
    expect(screen.getByTestId('login-logo-text')).toHaveTextContent('Happickle');
    expect(screen.getByTestId('login-subtitle')).toHaveTextContent('대한피클볼협회 공식 대회 플랫폼');
    expect(screen.getByTestId('kakao-login-button')).toHaveTextContent('카카오로 계속하기');
    expect(screen.getByTestId('kakao-login-button').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('apple-login-button')).toHaveTextContent('Apple로 계속하기');
    expect(screen.getByTestId('apple-login-button').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('social-login-pending-copy')).toHaveTextContent(/설정 키가 아직 전달되지 않았습니다/);
    expect(screen.getByTestId('login-consent-copy')).toHaveTextContent('처음이시면 자동으로 회원가입이 진행돼요');
    fireEvent.press(screen.getByTestId('signup-route-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/signup');
    expect(screen.queryByTestId('application-cta')).toBeNull();
    expect(screen.queryByTestId('mock-tournament-card')).toBeNull();

    mockPush.mockClear();
    fireEvent.press(screen.getByTestId('kakao-login-button'));
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('sandbox-login-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/tournaments');
  });

  it('renders the local-safe signup shell with safe navigation markers', () => {
    render(React.createElement(SignupScreen));

    expect(screen.getByTestId('signup-screen')).toHaveTextContent(/회원가입/);
    expect(screen.getByTestId('signup-account-fields')).toHaveTextContent(/계정 정보/);
    expect(screen.getByTestId('signup-profile-fields')).toHaveTextContent(/기본 정보/);
    expect(screen.getByTestId('signup-agreements')).toHaveTextContent(/필수.*이용약관 동의/);
    expect(screen.getByTestId('signup-local-notice')).toHaveTextContent(/가입 정보는 전송되지 않습니다/);
    fireEvent.press(screen.getByTestId('signup-back-to-login-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/');
  });

  it('renders the offline payment shell with safe navigation markers', () => {
    startParticipantSession();
    saveParticipantDupr('dupr-777');
    render(React.createElement(PaymentScreen));
    expect(screen.getByTestId('payment-screen')).toHaveTextContent(/결제 안내/);
    expect(screen.getByTestId('payment-order-summary')).toHaveTextContent(/60,000원/);
    expect(screen.getByTestId('payment-method')).toHaveTextContent(/운영자 오프라인 확인/);
    expect(screen.getByTestId('payment-local-notice')).toHaveTextContent(/이 화면에서는 결제가 진행되지 않습니다/);
    fireEvent.press(screen.getByTestId('payment-support-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/support');
  });

  it('lets a sandbox participant navigate detail, save DUPR, and submit a mock application', () => {
    startParticipantSession();
    render(React.createElement(TournamentsScreen));
    expect(screen.getByTestId('explore-home')).toHaveTextContent(/어떤 대회에 나가볼까요/);
    expect(screen.getByTestId('participant-api-mode')).toHaveTextContent('총 1개');
    expect(screen.getByTestId('court-preview')).toBeTruthy();
    expect(screen.getByTestId('mock-tournament-card')).toHaveTextContent(/PickleHub Open/);

    fireEvent.press(screen.getByTestId('mock-tournament-card'));
    expect(mockPush).toHaveBeenLastCalledWith(`/tournaments/${sandboxParticipantSession.featuredTournament.tournamentId}`);
  });

  it('lets a sandbox participant save DUPR and route to the application page', () => {
    startParticipantSession();
    render(React.createElement(DuprProfileScreen));
    expect(screen.getByTestId('dupr-management')).toHaveTextContent(/DUPR 프로필 스크린샷 첨부/);
    expect(screen.getByTestId('dupr-continue-application').props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(screen.getByTestId('dupr-input'), 'dupr-777');
    fireEvent.press(screen.getByTestId('save-dupr-button'));

    expect(screen.getByTestId('saved-dupr')).toHaveTextContent(/DUPR-777/);
    expect(screen.getByTestId('dupr-layout-hero')).toHaveTextContent(/현재 DUPR 저장됨/);
    expect(screen.getByTestId('dupr-continue-application').props.accessibilityState).toMatchObject({ disabled: false });

    fireEvent.press(screen.getByTestId('dupr-continue-application'));
    expect(mockPush).toHaveBeenLastCalledWith(`/tournaments/${sandboxParticipantSession.featuredTournament.tournamentId}/apply`);
  });

  it('lets a sandbox participant submit a mock application after DUPR is present', () => {
    startParticipantSession();
    saveParticipantDupr('dupr-777');
    render(React.createElement(TournamentApplicationScreen));
    expect(screen.getByTestId('application-layout-hero')).toHaveTextContent(/참가 신청/);
    expect(screen.getByText('복식 파트너 초대')).toBeTruthy();
    expect(screen.getByTestId('application-cta').props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(screen.getByTestId('application-cta'));

    expect(screen.getByTestId('application-submitted')).toHaveTextContent(/참가 신청 접수 완료/);
    expect(screen.getByTestId('application-submitted')).toHaveTextContent(/접수 부문 혼합복식/);
    expect(screen.getByTestId('application-submitted')).toHaveTextContent(/참가자 직접 취소 불가 · 1:1 문의/);
    fireEvent.press(screen.getByTestId('application-payment-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/payment');
  });

  it('connects bottom tabs and keeps the bottom nav fixed while content scrolls', () => {
    startParticipantSession();
    render(React.createElement(TournamentsScreen));

    const bottomNavStyle = StyleSheet.flatten(screen.getByTestId('bottom-nav').props.style);
    expect(bottomNavStyle).toMatchObject({ position: 'absolute', bottom: 0, left: 0, right: 0 });

    fireEvent.press(screen.getByTestId('bottom-tab-games'));
    expect(mockPush).toHaveBeenLastCalledWith('/games');
    fireEvent.press(screen.getByTestId('bottom-tab-notifications'));
    expect(mockPush).toHaveBeenLastCalledWith('/notifications');
    fireEvent.press(screen.getByTestId('bottom-tab-mypage'));
    expect(mockPush).toHaveBeenLastCalledWith('/mypage');
  });

  it('connects my page shortcuts and customer utility screens', () => {
    startParticipantSession();
    render(React.createElement(MyPageScreen));
    expect(screen.getByTestId('mypage-screen')).toHaveTextContent(/DUPR/);
    fireEvent.press(screen.getByTestId('mypage-reservations-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/reservation-history');
    fireEvent.press(screen.getByTestId('mypage-profile-edit-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/profile-edit');
    fireEvent.press(screen.getByTestId('mypage-support-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/support');
    fireEvent.press(screen.getByTestId('mypage-notification-settings-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/notification-settings');
    fireEvent.press(screen.getByTestId('mypage-account-withdrawal-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/account-withdrawal');
  });

  it('renders reservation history and profile edit shells from participant state', () => {
    startParticipantSession();
    saveParticipantDupr('dupr-777');
    render(React.createElement(React.Fragment, null,
      React.createElement(ReservationHistoryScreen),
      React.createElement(ProfileEditScreen),
    ));

    expect(screen.getByTestId('reservation-history-hero')).toHaveTextContent(/예약 내역/);
    expect(screen.getByTestId('reservation-history-screen')).toHaveTextContent(/오프라인 결제/);
    expect(screen.getByTestId('profile-edit-hero')).toHaveTextContent(/프로필 수정/);
    expect(screen.getByTestId('profile-edit-screen')).toHaveTextContent(/DUPR-777/);
    fireEvent.press(screen.getByTestId('reservation-support-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/support');
    fireEvent.press(screen.getByTestId('profile-edit-dupr-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/dupr-profile');
  });


  it('renders payment and cancellation terminal route shells with reference labels', () => {
    startParticipantSession();
    render(React.createElement(React.Fragment, null,
      React.createElement(PaymentCompleteScreen),
      React.createElement(CancelConfirmScreen),
      React.createElement(CancelCompleteScreen),
      React.createElement(PaymentFailureScreen),
    ));

    expect(screen.getByTestId('payment-complete-hero')).toHaveTextContent(/운영자 결제 확인 상태/);
    expect(screen.getByTestId('payment-complete-screen')).toHaveTextContent(/남자복식 · 김민준 \/ 이서연/);
    expect(screen.getByText('내 경기 보기')).toBeTruthy();
    expect(screen.getByTestId('cancel-confirm-hero')).toHaveTextContent(/참가 취소/);
    expect(screen.getByText(/환불 가능 여부 운영자 확인 대기/)).toBeTruthy();
    expect(screen.getByTestId('cancel-confirm-button')).toHaveTextContent(/취소·환불 1:1 문의/);
    expect(screen.getByTestId('cancel-complete-hero')).toHaveTextContent(/취소·환불 요청 접수/);
    expect(screen.getByText(/운영자 확인 후 안내/)).toBeTruthy();
    expect(screen.getByTestId('payment-failure-hero')).toHaveTextContent(/앱 내 결제 기능은 연결되지 않았습니다/);

    fireEvent.press(screen.getByTestId('payment-complete-games-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/games');
    fireEvent.press(screen.getByTestId('cancel-confirm-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/support');
    fireEvent.press(screen.getByTestId('payment-failure-retry-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/payment');
  });

  it('renders invite and partner terminal route shells with navigation markers', () => {
    startParticipantSession();
    render(React.createElement(React.Fragment, null,
      React.createElement(InviteDetailScreen),
      React.createElement(PartnerAcceptScreen),
      React.createElement(InviteExpiredScreen),
      React.createElement(PartnerDeclinedScreen),
    ));

    expect(screen.getByTestId('invite-detail-hero')).toHaveTextContent(/피클볼 대회 파트너 초대장/);
    expect(screen.getByTestId('invite-detail-screen')).toHaveTextContent(/PICKLE-7X9K2/);
    expect(screen.getByTestId('invite-kakao-button')).toHaveTextContent(/카카오톡으로 초대하기/);
    expect(screen.getByTestId('partner-accept-hero')).toHaveTextContent(/김민준님이 파트너로/);
    expect(screen.getByText(/초대자 김민준 · DUPR 4.2/)).toBeTruthy();
    expect(screen.getByTestId('invite-expired-hero')).toHaveTextContent(/초대 링크가 만료됐어요/);
    expect(screen.getByTestId('partner-declined-hero')).toHaveTextContent(/이서연님이 초대를 거절했어요/);

    fireEvent.press(screen.getByTestId('partner-accept-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/payment');
    fireEvent.press(screen.getByTestId('partner-declined-screen-reinvite-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/invite');
    fireEvent.press(screen.getByTestId('invite-expired-screen-cancel-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/cancel-confirm');
  });

  it('renders bracket and match-result route shells with reference labels and navigation markers', () => {
    startParticipantSession();
    render(React.createElement(React.Fragment, null,
      React.createElement(BracketScreen),
      React.createElement(ScoreEntryScreen),
      React.createElement(ResultConfirmScreen),
      React.createElement(FinalResultsScreen),
    ));

    expect(screen.getByTestId('bracket-screen')).toHaveTextContent(/대진표/);
    expect(screen.getByTestId('bracket-screen')).toHaveTextContent(/8강/);
    expect(screen.getByTestId('bracket-final-card')).toHaveTextContent(/센터코트/);
    expect(screen.getByTestId('bracket-final-card')).toHaveTextContent(/우승/);
    expect(screen.getByTestId('score-entry-screen')).toHaveTextContent(/점수 입력/);
    expect(screen.getByTestId('score-entry-screen')).toHaveTextContent(/입력한 결과는 상대팀 확인 후 확정됩니다/);
    expect(screen.getByTestId('score-entry-submit-button')).toHaveTextContent(/결과 제출하기/);
    expect(screen.getByTestId('result-confirm-screen')).toHaveTextContent(/제출된 결과/);
    expect(screen.getByTestId('result-confirm-screen')).toHaveTextContent(/승리: 김민준\/이서연 \(2:1\)/);
    expect(screen.getByTestId('result-confirm-button')).toHaveTextContent(/내용이 맞아요, 확인하기/);
    expect(screen.getByTestId('final-results-screen')).toHaveTextContent(/대회가 종료되었습니다/);
    expect(screen.getByTestId('final-results-screen')).toHaveTextContent(/내 최종 순위/);
    expect(screen.getByText(/김민준 · 이서연 · 8승 3패/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('score-entry-submit-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/result-confirm');
    fireEvent.press(screen.getByTestId('result-confirm-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/final-results');
    fireEvent.press(screen.getByTestId('result-dispute-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/dispute');
    fireEvent.press(screen.getByTestId('final-results-bracket-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/bracket');
    fireEvent.press(screen.getByTestId('final-results-home-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/tournaments');
  });

  it('renders signup, dispute, and notification utility shells with navigation markers', () => {
    startParticipantSession();
    render(React.createElement(React.Fragment, null,
      React.createElement(SignupCompleteScreen),
      React.createElement(DisputeScreen),
      React.createElement(DisputeCompleteScreen),
      React.createElement(NotificationSettingsScreen),
    ));

    expect(screen.getByTestId('signup-complete-screen')).toHaveTextContent(/회원가입이 완료됐어요/);
    expect(screen.getByTestId('signup-complete-button')).toHaveTextContent(/시작하기/);
    expect(screen.getByTestId('dispute-screen')).toHaveTextContent(/이의 제기 사유/);
    expect(screen.getByTestId('dispute-submit-button')).toHaveTextContent(/이의 제기 제출하기/);
    expect(screen.getByTestId('dispute-complete-screen')).toHaveTextContent(/이의 제기가 접수됐어요/);
    expect(screen.getByTestId('dispute-complete-screen')).toHaveTextContent(/처리 예정/);
    expect(screen.getByTestId('notification-settings-screen')).toHaveTextContent(/경기 호출 알림/);
    expect(screen.getByTestId('notification-settings-screen')).toHaveTextContent(/마케팅 정보 수신/);

    fireEvent.press(screen.getByTestId('signup-complete-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/tournaments');
    fireEvent.press(screen.getByTestId('dispute-submit-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/dispute-complete');
    fireEvent.press(screen.getByTestId('dispute-complete-games-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/games');
    fireEvent.press(screen.getByTestId('dispute-complete-home-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/tournaments');
  });

  it('opens and applies the local region selector from the explore route', () => {
    startParticipantSession();
    render(React.createElement(TournamentsScreen));

    fireEvent.press(screen.getByTestId('region-filter-button'));
    expect(screen.getByTestId('region-selector-modal')).toHaveTextContent(/지역 선택/);
    expect(screen.getByTestId('region-selector-modal')).toHaveTextContent(/전체 지역/);
    fireEvent.press(screen.getByTestId('region-option-gyeonggi'));
    fireEvent.press(screen.getByTestId('region-apply-button'));
    expect(screen.queryByTestId('region-selector-modal')).toBeNull();
    expect(screen.getByTestId('region-filter-button')).toHaveTextContent(/경기도/);
  });

  it('renders the account withdrawal reference screen as a non-destructive disabled shell', () => {
    startParticipantSession();
    render(React.createElement(AccountWithdrawalScreen));

    expect(screen.getByTestId('account-withdrawal-screen')).toHaveTextContent(/회원탈퇴 안내/);
    expect(screen.getByTestId('account-withdrawal-disabled-state')).toHaveTextContent(/회원탈퇴가 실행되지 않습니다/);
    expect(screen.getByTestId('account-withdrawal-disabled-state')).toHaveTextContent(/DB\/API 호출은 별도 승인/);
    expect(screen.getByTestId('account-withdrawal-disabled-button').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('account-withdrawal-support-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/support');
  });

  it('renders support policy copy on the support route', () => {
    startParticipantSession();
    render(React.createElement(SupportScreen));
    expect(screen.getByTestId('support-copy')).toHaveTextContent(/참가자 직접 취소 불가 · 1:1 문의/);
    expect(screen.getByTestId('support-copy')).toHaveTextContent(/1:1 문의로 접수/);
    expect(screen.getByTestId('support-copy')).toHaveTextContent(/참가자 직접 취소\/환불은 1:1 문의/);
    expect(screen.getByText(/이메일 1:1 문의/)).toBeTruthy();
    expect(screen.getByTestId('support-copy')).toHaveTextContent(/DUPR 정보는 어디서 확인하나요/);
  });

  it('binds support, notifications, and my page copy from API responses', async () => {
    const apiClient: ParticipantApiClient = {
      enabled: true,
      getTournaments: jest.fn(async () => [sandboxParticipantSession.featuredTournament]),
      getTournament: jest.fn(async () => ({ ...sandboxParticipantSession.featuredTournament, divisions: [] })),
      getParticipantProfile: jest.fn(async () => ({ ...sandboxParticipantSession.profile, displayName: 'API Player', duprId: 'DUPR-API', duprStatus: 'selfReportedPendingOperatorReview' })),
      getSupportCenter: jest.fn(async () => ({ policyCopy: '고객센터 정책 · 참가자 직접 취소 불가 · 1:1 문의. 참가자 직접 취소/환불은 1:1 문의로 운영자가 확인합니다.', contactEmail: 'support@happickle.kr', operatingHours: '평일 10:00 ~ 18:00', inquiries: [{ inquiryId: 'inquiry_api_001', participantId: 'participant_sandbox_001', channel: 'oneToOneInquiry', category: 'refund', subject: '환불 문의', status: 'operatorReview', createdAt: '2026-07-13T00:00:00.000Z' }] })),
      createSupportInquiry: jest.fn(async () => ({ inquiryId: 'inquiry_api_002', participantId: 'participant_sandbox_001', channel: 'oneToOneInquiry', category: 'refund', subject: '환불/취소 1:1 문의', status: 'operatorReview', createdAt: '2026-07-13T00:00:00.000Z' })),
      getNotifications: jest.fn(async () => ({ notifications: [{ notificationId: 'notification_api_001', participantId: 'participant_sandbox_001', type: 'support', title: 'API 알림 제목', body: 'API 알림 본문', createdAt: '2026-07-13T00:00:00.000Z' }] })),
      getMyPage: jest.fn(async () => ({ profile: { ...sandboxParticipantSession.profile, displayName: 'API Player', duprId: 'DUPR-API', duprStatus: 'selfReportedPendingOperatorReview' }, applications: [{ applicationId: 'application_api_001', tournamentId: sandboxParticipantSession.featuredTournament.tournamentId, participantId: 'participant_sandbox_001', duprId: 'DUPR-API', divisionId: 'local-mens', status: 'submitted', submittedAt: '2026-07-13T00:00:00.000Z', supportChannel: 'oneToOneInquiry', paymentStatus: 'notStartedSandbox', refundPolicy: 'participantSelfCancelDisabled' }], paymentRecords: [{ paymentRecordId: 'payment_api_001', applicationId: 'application_api_001', participantId: 'participant_sandbox_001', amountKrw: 60000, paymentMode: 'operatorManagedOffline', status: 'notStartedSandbox', operatorNote: '운영자 확인 대기', recordedAt: '2026-07-13T00:00:00.000Z' }] })),
      getGames: jest.fn(async () => [{ gameId: 'game_api_001', applicationId: 'application_api_001', tournamentId: sandboxParticipantSession.featuredTournament.tournamentId, tournamentTitle: 'API Open', divisionName: '남자복식', location: 'API Court', startsAt: '2026-08-09T00:00:00.000Z', applicationStatus: 'submitted', paymentStatus: 'notStartedSandbox', paymentAmountKrw: 60000, supportChannel: 'oneToOneInquiry', dataSource: 'db' }]),
      updateParticipantProfile: jest.fn(),
      createTournamentApplication: jest.fn(),
      getTournamentApplication: jest.fn(),
      requestParticipantSelfCancel: jest.fn(),
    };

    resetParticipantFlow(apiClient);
    startParticipantSession();
    render(React.createElement(React.Fragment, null,
      React.createElement(SupportScreen),
      React.createElement(NotificationsScreen),
      React.createElement(MyPageScreen),
      React.createElement(GamesScreen),
    ));
    expect(await screen.findByText(/고객센터 정책/)).toBeTruthy();
    expect(await screen.findByText('API 알림 제목')).toBeTruthy();
    expect(await screen.findByTestId('mypage-payment-status')).toHaveTextContent(/60,000원/);
    expect(await screen.findByTestId('mypage-recent-application')).toHaveTextContent(/접수 부문 남자복식/);
    expect(await screen.findByTestId('participant-game-card')).toHaveTextContent(/API Open/);
    expect(screen.getByTestId('participant-game-card')).not.toHaveTextContent(new RegExp(['DB 신청', '내역 기반'].join(' ')));
  });

  it('submits a DB-backed support inquiry from the support route', async () => {
    const apiClient: ParticipantApiClient = {
      enabled: true,
      getTournaments: jest.fn(async () => [sandboxParticipantSession.featuredTournament]),
      getTournament: jest.fn(),
      getParticipantProfile: jest.fn(async () => sandboxParticipantSession.profile),
      getSupportCenter: jest.fn(async () => ({ policyCopy: '고객센터 정책 · 참가자 직접 취소 불가 · 1:1 문의. 참가자 직접 취소/환불은 1:1 문의로 운영자가 확인합니다.', contactEmail: 'support@happickle.kr', operatingHours: '평일 10:00 ~ 18:00', inquiries: [] })),
      createSupportInquiry: jest.fn(async () => ({ inquiryId: 'inquiry_api_002', participantId: 'participant_sandbox_001', channel: 'oneToOneInquiry', category: 'refund', subject: '환불/취소 1:1 문의', status: 'operatorReview', createdAt: '2026-07-13T00:00:00.000Z' })),
      getNotifications: jest.fn(async () => ({ notifications: [] })),
      getMyPage: jest.fn(async () => ({ profile: sandboxParticipantSession.profile, applications: [], paymentRecords: [] })),
      getGames: jest.fn(async () => []),
      updateParticipantProfile: jest.fn(),
      createTournamentApplication: jest.fn(),
      getTournamentApplication: jest.fn(),
      requestParticipantSelfCancel: jest.fn(),
    };

    resetParticipantFlow(apiClient);
    startParticipantSession();
    render(React.createElement(SupportScreen));
    fireEvent.press(await screen.findByTestId('support-inquiry-submit'));

    expect(await screen.findByTestId('support-inquiry-state')).toHaveTextContent(/1:1 문의가 접수되었습니다/);
    expect(screen.getByTestId('support-center')).toHaveTextContent(/환불\/취소 1:1 문의/);
    expect(apiClient.createSupportInquiry).toHaveBeenCalledWith(expect.objectContaining({ category: 'refund', subject: '환불/취소 1:1 문의' }));
  });

  it('shows support inquiry fallback state when API submission fails', async () => {
    const apiClient: ParticipantApiClient = {
      enabled: true,
      getTournaments: jest.fn(async () => [sandboxParticipantSession.featuredTournament]),
      getTournament: jest.fn(),
      getParticipantProfile: jest.fn(async () => sandboxParticipantSession.profile),
      getSupportCenter: jest.fn(async () => ({ policyCopy: '고객센터 정책 · 참가자 직접 취소 불가 · 1:1 문의. 참가자 직접 취소/환불은 1:1 문의로 운영자가 확인합니다.', contactEmail: 'support@happickle.kr', operatingHours: '평일 10:00 ~ 18:00', inquiries: [] })),
      createSupportInquiry: jest.fn(async () => { throw new Error('PARTICIPANT_API_HTTP_500'); }),
      getNotifications: jest.fn(async () => ({ notifications: [] })),
      getMyPage: jest.fn(async () => ({ profile: sandboxParticipantSession.profile, applications: [], paymentRecords: [] })),
      getGames: jest.fn(async () => []),
      updateParticipantProfile: jest.fn(),
      createTournamentApplication: jest.fn(),
      getTournamentApplication: jest.fn(),
      requestParticipantSelfCancel: jest.fn(),
    };

    resetParticipantFlow(apiClient);
    startParticipantSession();
    render(React.createElement(SupportScreen));
    fireEvent.press(await screen.findByTestId('support-inquiry-submit'));

    expect(await screen.findByTestId('support-inquiry-state')).toHaveTextContent(/문의 접수에 실패했습니다/);
    expect(screen.getByTestId('support-inquiry-state')).not.toHaveTextContent(new RegExp(['폴백', '모드'].join(' ')));
  });

});
