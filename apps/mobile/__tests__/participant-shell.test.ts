import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { participantApplicationErrorCodeSchema } from '@template/contracts';
import { router } from 'expo-router';
import Home, {
  DuprProfileScreen,
  GamesScreen,
  MyPageScreen,
  NotificationsScreen,
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
    expect(screen.getByTestId('apple-login-button')).toHaveTextContent('Apple로 계속하기');
    expect(screen.getByTestId('login-consent-copy')).toHaveTextContent('처음이시면 자동으로 회원가입이 진행돼요');
    expect(screen.queryByTestId('application-cta')).toBeNull();
    expect(screen.queryByTestId('mock-tournament-card')).toBeNull();

    fireEvent.press(screen.getByTestId('kakao-login-button'));
    expect(mockPush).toHaveBeenLastCalledWith('/tournaments');
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
  });

  it('connects bottom tabs, my page shortcuts, and support copy', () => {
    startParticipantSession();
    render(React.createElement(TournamentsScreen));

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
