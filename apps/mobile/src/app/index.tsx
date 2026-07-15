import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ParticipantGame, ParticipantNotification, PaymentRecord, SupportCenterResponse, SupportInquiry, Tournament, TournamentDivision } from '@template/contracts';
import {
  type MockTournamentApplication,
  type MockTournament,
  type ParticipantProfile,
  REQUIRED_DUPR_ERROR,
  hasRequiredDupr,
  sandboxParticipantSession,
  saveSandboxDupr,
  describeApplicationPolicy,
  describeSupportRefundPolicyCopy,
  submitSandboxTournamentApplication,
} from '../participant/mock-session';
import { createParticipantApiClient, getParticipantApiConfigFromPublicEnv, type ParticipantApiClient } from '../participant/api-client';

const palette = {
  brand: '#558d60',
  word: '#549a3d',
  orange: '#ef8b2c',
  yellowPaddle: '#f4bf35',
  ink: '#1f2937',
  muted: '#6b7280',
  bg: '#f7faf8',
  surface: '#ffffff',
  mint: '#e9f1ea',
  line: '#e5e7eb',
  kakao: '#fee500',
  kakaoInk: '#2b1c15',
  live: '#F43F5E',
  success: '#2f7d4b',
  softGreen: '#eaf6d7',
  warning: '#b45309',
};

const defaultParticipantApi = createParticipantApiClient(getParticipantApiConfigFromPublicEnv());
const happickleLogo = require('../../assets/happickle_logo.png');
const defaultTournamentId = sandboxParticipantSession.featuredTournament.tournamentId;

type ParticipantStoreState = {
  socialSessionStarted: boolean;
  profile: ParticipantProfile;
  duprInput: string;
  application: MockTournamentApplication | null;
  featuredTournament: MockTournament;
  tournaments: Tournament[];
  tournamentDivisions: TournamentDivision[];
  supportCenter: SupportCenterResponse;
  notifications: ParticipantNotification[];
  paymentRecords: PaymentRecord[];
  participantGames: ParticipantGame[];
  apiMode: 'mock' | 'api' | 'fallback';
  routeStatus: Partial<Record<'support' | 'notifications' | 'mypage' | 'games' | 'tournamentDetail', 'loading' | 'ready' | 'fallback'>>;
  supportInquirySubmission: 'idle' | 'submitting' | 'submitted' | 'fallback';
};

const fallbackSupportCenter: SupportCenterResponse = {
  policyCopy: describeSupportRefundPolicyCopy({ refundPolicy: 'participantSelfCancelDisabled', supportChannel: 'oneToOneInquiry' }),
  contactEmail: 'support@happickle.kr',
  operatingHours: '평일 10:00 ~ 18:00 (주말·공휴일 휴무)',
  inquiries: [{ inquiryId: 'inquiry_local_refund', participantId: sandboxParticipantSession.profile.participantId, channel: 'oneToOneInquiry', category: 'refund', subject: '환불/취소는 1:1 문의로 접수', status: 'operatorReview', createdAt: '2026-07-13T09:00:00.000Z' }],
};

const fallbackNotifications: ParticipantNotification[] = [
  { notificationId: 'notification_local_deadline', participantId: sandboxParticipantSession.profile.participantId, type: 'tournamentDeadline', title: '대회 마감 임박!', body: '오늘까지 신청하세요', createdAt: '2026-07-13T09:00:00.000Z' },
];

const initialParticipantState = (participantApi: ParticipantApiClient): ParticipantStoreState => ({
  socialSessionStarted: false,
  profile: sandboxParticipantSession.profile,
  duprInput: sandboxParticipantSession.profile.duprId ?? '',
  application: null,
  featuredTournament: sandboxParticipantSession.featuredTournament,
  tournaments: [sandboxParticipantSession.featuredTournament],
  tournamentDivisions: [],
  supportCenter: fallbackSupportCenter,
  notifications: fallbackNotifications,
  paymentRecords: [],
  participantGames: [],
  apiMode: participantApi.enabled ? 'api' : 'mock',
  routeStatus: {},
  supportInquirySubmission: 'idle',
});

let participantApi = defaultParticipantApi;
let participantState = initialParticipantState(participantApi);
const participantListeners = new Set<() => void>();

function emitParticipantState() {
  for (const listener of participantListeners) listener();
}

function setParticipantState(nextState: ParticipantStoreState) {
  participantState = nextState;
  emitParticipantState();
}

function patchParticipantState(patch: Partial<ParticipantStoreState>) {
  setParticipantState({ ...participantState, ...patch });
}

function patchRouteStatus(route: keyof ParticipantStoreState['routeStatus'], status: NonNullable<ParticipantStoreState['routeStatus'][keyof ParticipantStoreState['routeStatus']]>) {
  patchParticipantState({ routeStatus: { ...participantState.routeStatus, [route]: status } });
}

function subscribeParticipantState(listener: () => void) {
  participantListeners.add(listener);
  return () => participantListeners.delete(listener);
}

function getParticipantSnapshot() {
  return participantState;
}

export function resetParticipantFlow(participantApiClient?: ParticipantApiClient) {
  participantApi = participantApiClient ?? defaultParticipantApi;
  participantState = initialParticipantState(participantApi);
  emitParticipantState();
}

function useParticipantFlow() {
  const state = useSyncExternalStore(subscribeParticipantState, getParticipantSnapshot, getParticipantSnapshot);
  const profileReady = state.socialSessionStarted && hasRequiredDupr(state.profile);
  const applicationPolicy = {
    refundPolicy: state.application?.refundPolicy ?? 'participantSelfCancelDisabled',
    supportChannel: state.application?.supportChannel ?? state.profile.supportChannel,
  } satisfies Pick<MockTournamentApplication, 'refundPolicy' | 'supportChannel'>;

  return useMemo(() => ({
    ...state,
    profileReady,
    applicationPolicy,
    policyCopy: describeApplicationPolicy(applicationPolicy),
    supportRefundPolicyCopy: state.supportCenter.policyCopy || describeSupportRefundPolicyCopy(applicationPolicy),
  }), [applicationPolicy, profileReady, state]);
}

export function startParticipantSession() {
  patchParticipantState({ socialSessionStarted: true });
  if (!participantApi.enabled) return;

  Promise.all([participantApi.getTournaments(), participantApi.getParticipantProfile()])
    .then(([tournaments, apiProfile]) => {
      patchParticipantState({
        featuredTournament: tournaments[0] ?? sandboxParticipantSession.featuredTournament,
        tournaments: tournaments.length ? tournaments : [sandboxParticipantSession.featuredTournament],
        profile: apiProfile,
        duprInput: apiProfile.duprId ?? '',
        apiMode: 'api',
      });
    })
    .catch(() => patchParticipantState({ apiMode: 'fallback' }));

  hydrateParticipantUtilityPages();
}

function hydrateParticipantUtilityPages() {
  if (!participantApi.enabled) return;
  patchParticipantState({
    routeStatus: {
      ...participantState.routeStatus,
      support: 'loading',
      notifications: 'loading',
      mypage: 'loading',
      games: 'loading',
    },
  });

  Promise.allSettled([participantApi.getSupportCenter(), participantApi.getNotifications(), participantApi.getMyPage(), participantApi.getGames()])
    .then(([supportResult, notificationResult, myPageResult, gamesResult]) => {
      const patch: Partial<ParticipantStoreState> = { routeStatus: { ...participantState.routeStatus } };

      if (supportResult.status === 'fulfilled') {
        patch.supportCenter = supportResult.value;
        patch.routeStatus = { ...patch.routeStatus, support: 'ready' };
      } else {
        patch.routeStatus = { ...patch.routeStatus, support: 'fallback' };
      }

      if (notificationResult.status === 'fulfilled') {
        patch.notifications = notificationResult.value.notifications;
        patch.routeStatus = { ...patch.routeStatus, notifications: 'ready' };
      } else {
        patch.routeStatus = { ...patch.routeStatus, notifications: 'fallback' };
      }

      if (myPageResult.status === 'fulfilled') {
        patch.application = myPageResult.value.applications[0] ?? null;
        patch.paymentRecords = myPageResult.value.paymentRecords;
        patch.routeStatus = { ...patch.routeStatus, mypage: 'ready' };
      } else {
        patch.routeStatus = { ...patch.routeStatus, mypage: 'fallback' };
      }

      if (gamesResult.status === 'fulfilled') {
        patch.participantGames = gamesResult.value;
        patch.routeStatus = { ...patch.routeStatus, games: 'ready' };
      } else {
        patch.routeStatus = { ...patch.routeStatus, games: 'fallback' };
      }

      patch.apiMode = [supportResult, notificationResult, myPageResult, gamesResult].every((result) => result.status === 'fulfilled') ? 'api' : 'fallback';
      patchParticipantState(patch);
    });
}

function loadTournament(tournamentId: string) {
  if (!participantApi.enabled || !tournamentId) return;
  patchRouteStatus('tournamentDetail', 'loading');
  participantApi.getTournament(tournamentId)
    .then((tournament) => patchParticipantState({ featuredTournament: tournament, tournamentDivisions: tournament.divisions, apiMode: 'api', routeStatus: { ...participantState.routeStatus, tournamentDetail: 'ready' } }))
    .catch(() => patchParticipantState({ apiMode: 'fallback', routeStatus: { ...participantState.routeStatus, tournamentDetail: 'fallback' } }));
}

function saveDupr() {
  const fallbackProfile = saveSandboxDupr(participantState.profile, participantState.duprInput);
  patchParticipantState({ profile: fallbackProfile, application: null });

  if (!participantApi.enabled) return;
  participantApi.updateParticipantProfile({ duprId: participantState.duprInput })
    .then((apiProfile) => {
      patchParticipantState({ profile: apiProfile, duprInput: apiProfile.duprId ?? '', apiMode: 'api' });
    })
    .catch(() => patchParticipantState({ apiMode: 'fallback' }));
}

export function saveParticipantDupr(duprId: string) {
  setParticipantState({ ...participantState, duprInput: duprId });
  saveDupr();
}

function getSelectedDivision() {
  return getAvailableDivisions(participantState.tournamentDivisions)[0];
}

function submitApplication() {
  const selectedDivision = getSelectedDivision();
  const fallbackApplication = submitSandboxTournamentApplication({
    profile: participantState.profile,
    tournament: participantState.featuredTournament,
    division: selectedDivision,
  });
  patchParticipantState({ application: fallbackApplication });

  if (!participantApi.enabled) return;
  participantApi.createTournamentApplication({
    tournamentId: participantState.featuredTournament.tournamentId,
    participantId: participantState.profile.participantId,
    duprId: participantState.profile.duprId,
    divisionId: selectedDivision?.divisionId,
  })
    .then((createdApplication) => participantApi.getTournamentApplication(createdApplication.applicationId))
    .then((apiApplication) => {
      patchParticipantState({ application: apiApplication, apiMode: 'api' });
      hydrateParticipantUtilityPages();
    })
    .catch(() => patchParticipantState({ apiMode: 'fallback' }));
}


const SUPPORT_INQUIRY_PAYLOAD = {
  category: 'refund',
  subject: '환불/취소 1:1 문의',
} as const;

function createFallbackSupportInquiry(): SupportInquiry {
  return {
    inquiryId: `inquiry_local_${Date.now()}`,
    participantId: participantState.profile.participantId,
    applicationId: participantState.application?.applicationId,
    channel: 'oneToOneInquiry',
    category: SUPPORT_INQUIRY_PAYLOAD.category,
    subject: SUPPORT_INQUIRY_PAYLOAD.subject,
    status: 'operatorReview',
    createdAt: new Date().toISOString(),
  };
}

function submitSupportInquiry() {
  patchParticipantState({ supportInquirySubmission: 'submitting' });

  if (!participantApi.enabled) {
    patchParticipantState({
      supportInquirySubmission: 'submitted',
      supportCenter: { ...participantState.supportCenter, inquiries: [createFallbackSupportInquiry(), ...participantState.supportCenter.inquiries] },
    });
    return;
  }

  participantApi.createSupportInquiry({
    ...SUPPORT_INQUIRY_PAYLOAD,
    applicationId: participantState.application?.applicationId,
  })
    .then((inquiry) => patchParticipantState({
      supportInquirySubmission: 'submitted',
      supportCenter: { ...participantState.supportCenter, inquiries: [inquiry, ...participantState.supportCenter.inquiries] },
      apiMode: 'api',
      routeStatus: { ...participantState.routeStatus, support: 'ready' },
    }))
    .catch(() => patchParticipantState({
      supportInquirySubmission: 'fallback',
      apiMode: 'fallback',
      routeStatus: { ...participantState.routeStatus, support: 'fallback' },
    }));
}

function setDuprInput(duprInput: string) {
  patchParticipantState({ duprInput });
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <Image
      accessibilityLabel="Happickle"
      resizeMode="contain"
      source={happickleLogo}
      testID={small ? 'header-logo' : 'login-logo'}
      style={small ? styles.logoImageSmall : styles.logoImage}
    />
  );
}

function HeaderBell() {
  return <View testID="header-bell" style={styles.headerBell}><Text style={styles.headerBellIcon}>♧</Text></View>;
}

function CourtPreview({ live = false }: { live?: boolean }) {
  return (
    <View testID="court-preview" style={styles.courtPreview}>
      <View style={styles.courtLineTop} />
      <View style={styles.courtLineMid} />
      <View style={styles.courtLineBottom} />
      <View style={styles.courtCenterLine} />
      <View style={[styles.courtDot, styles.courtDotTopLeft, live && styles.courtDotLive]} />
      <View style={[styles.courtDot, styles.courtDotTopRight, live && styles.courtDotLive]} />
      <View style={styles.courtDotCenter} />
      <View style={styles.courtNet} />
      <View style={styles.courtNetHandleLeft} />
      <View style={styles.courtNetHandleRight} />
      <View style={[styles.courtPlayer, styles.courtPlayerLeft]} />
      <View style={[styles.courtPlayer, styles.courtPlayerRight]} />
    </View>
  );
}

function ActionButton({ testID, label, onPress, secondary = false, disabled = false }: { testID: string; label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[secondary ? styles.secondaryAction : styles.primaryAction, disabled && styles.disabledAction]}><Text style={secondary ? styles.secondaryActionText : styles.primaryActionText}>{label}</Text></Pressable>;
}

function Row({ left, right }: { left: string; right?: string }) {
  return <View style={styles.infoRow}><Text style={styles.bodyCopy}>{left}</Text>{right ? <Text style={styles.rowRight}>{right}</Text> : null}</View>;
}

function PageHero({ testID, eyebrow, title, caption, children }: { testID: string; eyebrow: string; title: string; caption?: string; children?: ReactNode }) {
  return <View testID={testID} style={styles.pageHero}><Text style={styles.sectionLabel}>{eyebrow}</Text><Text style={styles.heroTitle}>{title}</Text>{caption ? <Text style={styles.caption}>{caption}</Text> : null}{children}</View>;
}

function InfoCard({ testID, title, children }: { testID?: string; title?: string; children: ReactNode }) {
  return <View testID={testID} style={styles.infoCard}>{title ? <Text style={styles.sectionTitleSmall}>{title}</Text> : null}{children}</View>;
}

function InfoListItem({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <View style={styles.infoListItem}><Text style={styles.caption}>{label}</Text><Text style={muted ? styles.caption : styles.rowRight}>{value}</Text></View>;
}

function StatusListCard({ testID, title, meta, caption, badgeText }: { testID?: string; title: string; meta: string; caption?: string; badgeText?: string }) {
  return <View testID={testID} style={styles.statusListCard}>{badgeText ? <Text style={styles.badge}>{badgeText}</Text> : null}<Text style={styles.choiceTitle}>{title}</Text><Text style={styles.bodyCopy}>{meta}</Text>{caption ? <Text style={styles.caption}>{caption}</Text> : null}</View>;
}

function participantApiModeLabel(apiMode: ParticipantStoreState['apiMode']) {
  if (apiMode === 'api') return '최신 대회 정보';
  if (apiMode === 'fallback') return '일부 정보를 불러오지 못했습니다';
  return '대회 미리보기';
}

function routeStatusCopy(status?: NonNullable<ParticipantStoreState['routeStatus'][keyof ParticipantStoreState['routeStatus']]>) {
  if (status === 'loading') return '최신 정보를 불러오는 중입니다.';
  if (status === 'fallback') return '일부 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
  if (status === 'ready') return undefined;
  return undefined;
}

function RouteStatusNotice({ status }: { status?: NonNullable<ParticipantStoreState['routeStatus'][keyof ParticipantStoreState['routeStatus']]> }) {
  const copy = routeStatusCopy(status);
  if (!copy) return null;
  return <Text testID="participant-route-state" style={status === 'fallback' ? styles.blockerText : styles.caption}>{copy}</Text>;
}

function applicationSubmittedLabel(apiMode: ParticipantStoreState['apiMode']) {
  if (apiMode === 'fallback') return '신청 접수 확인 중';
  return '참가 신청 접수 완료';
}

function formatTournamentDate(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return startsAt;
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

function paymentAmountCopy(paymentRecord?: PaymentRecord) {
  return `${(paymentRecord?.amountKrw ?? 60000).toLocaleString('ko-KR')}원`;
}

function paymentMethodCopy(paymentRecord?: PaymentRecord) {
  if (paymentRecord?.paymentMode === 'operatorManagedOffline') return '운영자 오프라인 확인';
  return '카드결제 (PG)';
}

function inviteCountdownCopy() {
  return '유효기간 72시간 · 42:18:05 남음';
}

function tournamentDdayCopy(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return '일정 확인';
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  return days > 0 ? `D-${days}` : '진행 예정';
}

const fallbackTournamentDivisions: TournamentDivision[] = [
  { divisionId: 'local-mixed', tournamentId: defaultTournamentId, name: '혼합복식', skillLevel: 'DUPR 3.5+', teamType: 'doubles', entryFeeKrw: 60000, capacityTeams: 32 },
  { divisionId: 'local-mens', tournamentId: defaultTournamentId, name: '남자복식', skillLevel: 'DUPR 3.5~4.5', teamType: 'doubles', entryFeeKrw: 60000, capacityTeams: 64 },
];

function getAvailableDivisions(tournamentDivisions: TournamentDivision[]) {
  return tournamentDivisions.length ? tournamentDivisions : fallbackTournamentDivisions;
}

function getApplicationDivisionName(application: MockTournamentApplication | null, divisions: TournamentDivision[], defaultDivision?: TournamentDivision) {
  const selectedDivision = application?.divisionId ? divisions.find((division) => division.divisionId === application.divisionId) : undefined;
  return selectedDivision?.name ?? defaultDivision?.name ?? '부문 확인 중';
}

function divisionTeamCopy(teamType: string) {
  return teamType === 'singles' ? '단식' : '복식';
}

function divisionFeeCopy(division: TournamentDivision) {
  return `${division.entryFeeKrw.toLocaleString('ko-KR')}원 · 운영자 확인 후 오프라인 결제 안내`;
}

function divisionEligibilityCopy(division: TournamentDivision) {
  return `${division.skillLevel ?? 'DUPR 제한없음'} · DUPR 등록 후 신청 가능`;
}

const bottomTabs = [
  { label: '탐색', route: '/tournaments', testID: 'bottom-tab-explore', active: 'tournaments' },
  { label: '내 경기', route: '/games', testID: 'bottom-tab-games', active: 'games' },
  { label: '알림', route: '/notifications', testID: 'bottom-tab-notifications', active: 'notifications' },
  { label: '마이', route: '/mypage', testID: 'bottom-tab-mypage', active: 'mypage' },
] as const;

function BottomNav({ active }: { active: string }) {
  return (
    <View testID="bottom-nav" style={styles.bottomNav}>{bottomTabs.map((tab) => (
      <Pressable key={tab.label} testID={tab.testID} accessibilityRole="button" onPress={() => router.push(tab.route)} style={[styles.navButton, active === tab.active && styles.navButtonActive]}>
        <Text style={[styles.bottomNavItem, active === tab.active && styles.bottomNavItemActive]}>{tab.label}</Text>
      </Pressable>
    ))}</View>
  );
}

function LoginScreen({ participantApiClient }: { participantApiClient?: ParticipantApiClient }) {
  const initialized = useRef(false);
  if (!initialized.current) {
    resetParticipantFlow(participantApiClient);
    initialized.current = true;
  }

  const start = () => {
    startParticipantSession();
    router.push('/tournaments');
  };

  return (
    <View style={styles.loginScreen}><View testID="login-artboard" style={styles.phoneFrame}><View style={styles.loginMain}>
      <Logo /><Text testID="login-logo-text" style={styles.hiddenParityText}>Happickle</Text>
      <Text testID="login-subtitle" style={styles.tagline}>대한피클볼협회 공식 대회 플랫폼</Text>
      <View testID="login-illustration" style={styles.illWrap}><Text style={styles.illIcon}>◌</Text><Text style={styles.illHandle}>╲</Text></View>
      <Pressable testID="kakao-login-button" accessibilityRole="button" onPress={start} style={[styles.btn, styles.kakaoButton]}><Text style={styles.kakaoButtonText}>카카오로 계속하기</Text></Pressable>
      <Pressable testID="apple-login-button" accessibilityRole="button" onPress={start} style={[styles.btn, styles.appleButton]}><Text style={styles.appleButtonText}>Apple로 계속하기</Text></Pressable>
      <Text testID="login-consent-copy" style={styles.hint}>처음이시면 자동으로 회원가입이 진행돼요</Text>
      <Pressable testID="signup-route-button" accessibilityRole="button" onPress={() => router.push('/signup')}><Text style={styles.linkText}>회원가입 폼 미리보기</Text></Pressable>
    </View></View></View>
  );
}

function ParticipantRouteScaffold({ active, children }: { active: string; children: ReactNode }) {
  const { socialSessionStarted } = useParticipantFlow();
  if (!socialSessionStarted) return <LoginScreen />;

  return (
    <View style={styles.participantShell}>
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <View style={styles.header}><View><Logo small /><Text style={styles.headerSubtitle}>대한피클볼협회 공식</Text></View><HeaderBell /></View>
        {children}
        <View testID="deferred-reference-screens" style={styles.sectionCard}><Text style={styles.sectionLabel}>운영 예정 기능</Text><Text style={styles.caption}>결제 · 환불 · 대진표 · 점수 입력 · 결과 확정은 운영자 안내에 따라 순차적으로 제공됩니다.</Text></View>
      </ScrollView>
      <BottomNav active={active} />
    </View>
  );
}

export type HomeProps = {
  participantApiClient?: ParticipantApiClient;
};

export default function Home({ participantApiClient }: HomeProps = {}) {
  return <LoginScreen participantApiClient={participantApiClient} />;
}

export function SignupScreen() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  return (
    <ScrollView testID="signup-screen" style={styles.page} contentContainerStyle={styles.content}>
      <PageHero testID="signup-hero" eyebrow="회원가입" title="기본 정보를 확인해 보세요" caption="M0B 화면을 반영한 로컬 미리보기입니다." />
      <InfoCard testID="signup-account-fields" title="계정 정보">
        <TextInput testID="signup-email-input" accessibilityLabel="이메일" autoCapitalize="none" keyboardType="email-address" onChangeText={setEmail} placeholder="이메일" placeholderTextColor={palette.muted} value={email} style={styles.input} />
        <TextInput testID="signup-password-input" accessibilityLabel="비밀번호" placeholder="비밀번호 (8자 이상)" placeholderTextColor={palette.muted} secureTextEntry style={styles.input} />
        <TextInput testID="signup-password-confirm-input" accessibilityLabel="비밀번호 확인" placeholder="비밀번호 확인" placeholderTextColor={palette.muted} secureTextEntry style={styles.input} />
      </InfoCard>
      <InfoCard testID="signup-profile-fields" title="기본 정보">
        <TextInput testID="signup-name-input" accessibilityLabel="이름" onChangeText={setName} placeholder="이름" placeholderTextColor={palette.muted} value={name} style={styles.input} />
        <TextInput testID="signup-phone-input" accessibilityLabel="연락처" keyboardType="phone-pad" onChangeText={setPhone} placeholder="연락처 (010-0000-0000)" placeholderTextColor={palette.muted} value={phone} style={styles.input} />
        <View style={styles.actionRow}><Text style={[styles.secondaryPill, styles.selectedPill]}>남성</Text><Text style={styles.secondaryPill}>여성</Text></View>
        <TextInput testID="signup-birth-input" accessibilityLabel="생년월일 또는 연령대" placeholder="생년월일 또는 연령대" placeholderTextColor={palette.muted} style={styles.input} />
        <TextInput testID="signup-dupr-input" accessibilityLabel="DUPR ID" placeholder="DUPR ID (선택)" placeholderTextColor={palette.muted} style={styles.input} />
        <Text style={styles.caption}>DUPR 프로필 스크린샷을 첨부하면 관리자 확인이 빨라져요</Text>
        <TextInput testID="signup-club-input" accessibilityLabel="소속 클럽" placeholder="소속 · 클럽 (선택)" placeholderTextColor={palette.muted} style={styles.input} />
      </InfoCard>
      <InfoCard testID="signup-agreements" title="약관 동의"><Text style={styles.bodyCopy}>☑ [필수] 개인정보 수집 · 이용에 동의{`\n`}☑ [필수] 이용약관 동의{`\n`}☐ [선택] 마케팅 정보 수신 동의</Text></InfoCard>
      <Text testID="signup-local-notice" style={styles.blockerText}>이 미리보기에서 가입 정보는 전송되지 않습니다.</Text>
      <ActionButton testID="signup-back-to-login-button" label="로그인으로 돌아가기" onPress={() => router.push('/')} />
    </ScrollView>
  );
}

export function TournamentsScreen() {
  const { featuredTournament, tournaments, apiMode } = useParticipantFlow();
  const [region, setRegion] = useState('서울특별시');
  const [pendingRegion, setPendingRegion] = useState(region);
  const [regionSelectorOpen, setRegionSelectorOpen] = useState(false);
  const visibleTournaments = tournaments.length ? tournaments : [featuredTournament];

  return (
    <ParticipantRouteScaffold active="tournaments">
      <View testID="explore-home" style={styles.heroCard}>
        <Text style={styles.heroTitle}>어떤 대회에 나가볼까요?</Text><View style={styles.searchBox}><Text style={styles.searchText}>⌕  대회명으로 검색</Text></View>
        <View style={styles.filterToolbar}><Pressable testID="region-filter-button" accessibilityRole="button" onPress={() => setRegionSelectorOpen(true)}><Text style={[styles.filterChip, styles.locationChip]}>⌖ {region}⌄</Text></Pressable><Text style={styles.filterChip}>최신순⌄</Text></View>
        <View style={styles.filterRow}>{['접수중', '접수마감', '종료'].map((chip) => <Text key={chip} style={[styles.statusChip, chip === '접수중' && styles.activeChip]}>{chip}</Text>)}</View>
        <View style={styles.cardTopRow}><Text style={styles.sectionTitleSmall}>접수 중인 대회</Text><Text testID="participant-api-mode" style={styles.countText}>총 {visibleTournaments.length}개</Text></View>
      </View>
      {regionSelectorOpen ? <InfoCard testID="region-selector-modal" title="지역 선택">
        {[
          ['seoul', '서울특별시'],
          ['gyeonggi', '경기도'],
          ['incheon', '인천광역시'],
          ['busan', '부산광역시'],
          ['daegu', '대구광역시'],
          ['all', '전체 지역'],
        ].map(([key, label]) => <Pressable key={key} testID={`region-option-${key}`} accessibilityRole="radio" accessibilityState={{ selected: pendingRegion === label }} onPress={() => setPendingRegion(label)} style={styles.infoListItem}><Text style={pendingRegion === label ? styles.statusStrong : styles.bodyCopy}>{pendingRegion === label ? '● ' : '○ '}{label}</Text></Pressable>)}
        <ActionButton testID="region-apply-button" label="적용하기" onPress={() => { setRegion(pendingRegion); setRegionSelectorOpen(false); }} />
      </InfoCard> : null}
      {visibleTournaments.map((tournament, index) => {
        const tournamentPath = `/tournaments/${tournament.tournamentId}`;
        return (
          <Pressable key={tournament.tournamentId} testID={index === 0 ? 'mock-tournament-card' : 'api-tournament-card'} accessibilityRole="button" onPress={() => router.push(tournamentPath)} style={styles.tournamentCard}>
            <CourtPreview live={index > 0} />
            <View style={styles.tournamentCardBody}>
              <View style={styles.cardTopRow}><View style={styles.badgeRow}><Text style={styles.badge}>접수중</Text><Text style={styles.dDay}>{tournamentDdayCopy(tournament.startsAt)}</Text></View><Text style={styles.countText}>상세 보기</Text></View>
              <Text style={styles.cardTitle}>{tournament.title}</Text><Text style={styles.bodyCopy}>{formatTournamentDate(tournament.startsAt)}</Text><Text style={styles.bodyCopy}>{tournament.location}</Text>
              <View style={styles.divisionRow}><Text style={styles.divisionChip}>{tournament.division}</Text><Text style={styles.divisionChip}>{tournament.requiresDupr ? 'DUPR 필수' : 'DUPR 선택'}</Text></View><Text style={styles.caption}>결제 방식</Text><Text style={styles.priceText}>{tournament.paymentMode === 'operatorManagedOffline' ? '운영자 오프라인 확인' : tournament.paymentMode}</Text>
            </View>
          </Pressable>
        );
      })}
      <View testID="quick-actions" style={styles.sectionCard}><Text style={styles.sectionTitle}>빠른 이동</Text><ActionButton testID="go-support-button" label="1:1 문의 보기" secondary onPress={() => router.push('/support')} /><ActionButton testID="go-dupr-button" label="DUPR 등록하기" secondary onPress={() => router.push('/dupr-profile')} /></View>
    </ParticipantRouteScaffold>
  );
}


export function TournamentDetailScreen({ tournamentId = defaultTournamentId }: { tournamentId?: string }) {
  const { featuredTournament, tournamentDivisions, profileReady, policyCopy, routeStatus } = useParticipantFlow();
  useEffect(() => loadTournament(tournamentId), [tournamentId]);
  const applyRoute = `/tournaments/${featuredTournament.tournamentId}/apply`;
  const availableDivisions = getAvailableDivisions(tournamentDivisions);

  return (
    <ParticipantRouteScaffold active="tournaments">
      <PageHero testID="detail-layout-hero" eyebrow="대회 상세" title={featuredTournament.title} caption="대회 일정, 장소, 신청 부문을 확인하세요.">
        <CourtPreview live />
      </PageHero>
      <InfoCard testID="tournament-detail" title="대회 정보">
        <RouteStatusNotice status={routeStatus.tournamentDetail} />
        <View style={styles.badgeRow}><Text style={styles.badge}>접수중</Text><Text style={styles.dDay}>{tournamentDdayCopy(featuredTournament.startsAt)}</Text></View>
        <InfoListItem label="주최" value="대한피클볼협회" />
        <InfoListItem label="일정" value={formatTournamentDate(featuredTournament.startsAt)} />
        <InfoListItem label="장소" value={featuredTournament.location} />
        <InfoListItem label="신청 방식" value={`${featuredTournament.requiresDupr ? 'DUPR 등록 후 ' : ''}부문 확인 · 운영자 오프라인 결제 안내`} />
        <Text style={styles.linkText}>지도보기</Text>
      </InfoCard>
      <InfoCard title="신청 가능한 부문">
        {availableDivisions.map((division) => <StatusListCard key={division.divisionId} testID="division-option" title={`${division.name} · ${divisionTeamCopy(division.teamType)}`} meta={`${divisionEligibilityCopy(division)} · 마감 8/7`} caption={`정원 ${division.capacityTeams ?? 32}팀 · ${divisionFeeCopy(division)}`} />)}
      </InfoCard>
      <InfoCard title="대회요강"><Text style={styles.caption}>· 경기방식: 예선 라운드로빈 후 본선 토너먼트{`
`}· 공인구: OPTIC 피클볼 공인구 사용{`
`}· 복장: 무지 상의 권장, 실내용 러버솔 착용 필수{`
`}· 우천/불가항력 시 일정은 주최측 공지에 따름</Text></InfoCard>
      <InfoCard title="환불 규정"><Text style={styles.caption}>대회 3일 전까지 100% 환불 · 3일 이내 환불 불가 · 주최 측 취소 시 전액 환불됩니다. {policyCopy}</Text></InfoCard>
      <ActionButton testID="detail-apply-button" label="참가 신청으로 이동" onPress={() => router.push(profileReady ? applyRoute : '/dupr-profile')} />
    </ParticipantRouteScaffold>
  );
}

export function DuprProfileScreen() {
  const { profile, duprInput, profileReady, featuredTournament } = useParticipantFlow();

  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="dupr-layout-hero" eyebrow="DUPR 정보 관리" title={profileReady ? '현재 DUPR 저장됨' : '참가 신청 전 DUPR 정보가 필요해요'} caption="DUPR ID 또는 프로필 링크를 저장하면 참가 신청을 이어갈 수 있어요." />
      <View testID="dupr-management" style={styles.duprCard}><Text style={styles.bigDupr}>{hasRequiredDupr(profile) ? profile.duprId : '4.2'}</Text><Text style={styles.statusStrong}>관리자 확인중</Text><Text style={styles.bodyCopy}>DUPR 프로필 스크린샷 첨부 · 확인이 빨라져요 (JPG, PNG)</Text><Text style={styles.caption}>DUPR 값은 자기신고 기준이며 대회 참가 시 참고용으로만 표시됩니다</Text></View>
      <InfoCard title="DUPR 입력"><TextInput testID="dupr-input" accessibilityLabel="DUPR ID" onChangeText={setDuprInput} placeholder="DUPR ID 또는 프로필 링크" placeholderTextColor={palette.muted} value={duprInput} style={styles.input} /><ActionButton testID="save-dupr-button" label="저장하기" secondary onPress={saveDupr} />{hasRequiredDupr(profile) ? <Text testID="saved-dupr" style={styles.statusStrong}>현재 DUPR {profile.duprId} · 관리자 확인중</Text> : null}</InfoCard>
      <ActionButton testID="dupr-continue-application" label="참가 신청 계속" onPress={() => router.push(`/tournaments/${featuredTournament.tournamentId}/apply`)} disabled={!hasRequiredDupr(profile)} />
    </ParticipantRouteScaffold>
  );
}

export function TournamentApplicationScreen({ tournamentId = defaultTournamentId }: { tournamentId?: string }) {
  const { profile, profileReady, application, featuredTournament, tournamentDivisions, apiMode } = useParticipantFlow();
  useEffect(() => loadTournament(tournamentId), [tournamentId]);
  const availableDivisions = getAvailableDivisions(tournamentDivisions);
  const selectedDivision = availableDivisions[0];
  const submittedDivisionName = getApplicationDivisionName(application, availableDivisions, selectedDivision);

  return (
    <ParticipantRouteScaffold active="tournaments">
      <PageHero testID="application-layout-hero" eyebrow="참가 신청" title={featuredTournament.title} caption="부문, 참가자 정보, 약관을 확인한 뒤 신청을 접수하세요." />
      <InfoCard testID="application-form" title="신청 부문">
        <StatusListCard testID="application-division-summary" title={`기본 선택 부문 · ${selectedDivision.name}`} meta={`${divisionEligibilityCopy(selectedDivision)} · ${divisionTeamCopy(selectedDivision.teamType)}`} caption={divisionFeeCopy(selectedDivision)} badgeText="선택됨" />
        {availableDivisions.map((division) => <Text key={division.divisionId} style={styles.caption}>· {division.name}: {divisionEligibilityCopy(division)} · {divisionFeeCopy(division)}</Text>)}
      </InfoCard>
      <InfoCard title="참가자 정보"><InfoListItem label="대표자" value={profile.displayName} /><InfoListItem label="DUPR" value={hasRequiredDupr(profile) ? `${profile.duprId}` : '미등록'} /><InfoListItem label="연락처" value="010-••••-5678" /></InfoCard>
      <InfoCard title="복식 파트너 초대"><Text style={styles.bodyCopy}>파트너 전화번호를 입력해 초대하세요</Text><Text style={styles.linkText}>초대하기</Text><Text style={styles.caption}>유효기간 72시간 · 링크 재발송 가능</Text></InfoCard>
      <InfoCard title="약관 동의"><Text style={styles.caption}>[필수] 개인정보 수집·이용에 동의합니다{`
`}[필수] 환불 규정을 확인하였습니다{`
`}신청 후 참가자 직접 취소와 환불은 1:1 문의로 운영자가 안내합니다. 결제는 실시간 PG 없이 운영자 확인 후 오프라인으로 안내됩니다.</Text></InfoCard>
      {!profileReady ? <Text testID="application-blocker" style={styles.blockerText}>{REQUIRED_DUPR_ERROR}: DUPR 정보를 저장한 뒤 참가 신청을 진행할 수 있어요.</Text> : null}
      <Pressable testID="application-cta" accessibilityRole="button" accessibilityState={{ disabled: !profileReady }} disabled={!profileReady} onPress={submitApplication} style={[styles.primaryAction, !profileReady && styles.disabledAction]}><Text style={styles.primaryActionText}>{profileReady ? '참가 신청하기' : 'DUPR 등록 후 신청 가능'}</Text></Pressable>
      {application ? <Text testID="application-submitted" style={styles.statusStrong}>{applicationSubmittedLabel(apiMode)} · 접수 부문 {submittedDivisionName} · {describeApplicationPolicy(application)}</Text> : null}
      {application ? <ActionButton testID="application-payment-button" label="결제 안내 확인" secondary onPress={() => router.push('/payment')} /> : null}
    </ParticipantRouteScaffold>
  );
}

export function SupportScreen() {
  const { supportRefundPolicyCopy, supportCenter, routeStatus, supportInquirySubmission } = useParticipantFlow();

  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="support-layout-hero" eyebrow="고객센터" title="무엇을 도와드릴까요?" caption="환불·취소 요청과 대회 문의는 1:1 문의로 운영자가 확인합니다." />
      <InfoCard testID="support-center" title="자주 묻는 질문"><RouteStatusNotice status={routeStatus.support} /><Text testID="support-copy" style={styles.bodyCopy}>{supportRefundPolicyCopy}</Text><ActionButton testID="support-inquiry-submit" label={supportInquirySubmission === 'submitting' ? '1:1 문의 접수 중' : '환불/취소 1:1 문의 접수'} onPress={submitSupportInquiry} disabled={supportInquirySubmission === 'submitting'} />{supportInquirySubmission === 'submitted' ? <Text testID="support-inquiry-state" style={styles.statusStrong}>1:1 문의가 접수되었습니다. 운영자가 확인 후 안내합니다.</Text> : null}{supportInquirySubmission === 'fallback' ? <Text testID="support-inquiry-state" style={styles.blockerText}>문의 접수에 실패했습니다. 카카오톡 또는 이메일 1:1 문의로 접수해 주세요.</Text> : null}</InfoCard>
      <InfoCard title="문의 내역">{supportCenter.inquiries.map((inquiry) => <StatusListCard key={inquiry.inquiryId} title={inquiry.subject} meta={`상태 · ${inquiry.status}`} caption="운영자 확인 후 안내됩니다." />)}</InfoCard>
      <InfoCard title="문의 채널"><View style={styles.actionRow}><Text style={styles.secondaryPill}>카카오톡 1:1 문의</Text><Text style={styles.secondaryPill}>이메일 1:1 문의</Text></View><Text style={styles.caption}>운영시간: {supportCenter.operatingHours}{`
`}{supportCenter.contactEmail} (1:1 문의 접수용){`
`}대한피클볼협회 운영</Text></InfoCard>
    </ParticipantRouteScaffold>
  );
}

export function GamesScreen() {
  const { participantGames, routeStatus } = useParticipantFlow();
  return <ParticipantRouteScaffold active="games"><PageHero testID="games-layout-hero" eyebrow="내 경기" title="신청한 경기 일정" caption="접수된 대회와 결제 상태를 한눈에 확인하세요." /><InfoCard testID="my-games-screen"><RouteStatusNotice status={routeStatus.games} />{participantGames.length ? participantGames.map((game) => <StatusListCard key={game.gameId} testID="participant-game-card" title={game.tournamentTitle} meta={`${formatTournamentDate(game.startsAt)} · ${game.location}`} caption={`${game.divisionName ?? '부문 확인 중'} · 신청 ${game.applicationStatus} · 결제 ${game.paymentStatus}${game.paymentAmountKrw ? ` · ${game.paymentAmountKrw.toLocaleString('ko-KR')}원` : ''}`} badgeText="예정" />) : <Text testID="games-empty" style={styles.caption}>아직 표시할 경기 일정이 없습니다. 대회 신청이 접수되면 여기에 표시됩니다.</Text>}<Text style={styles.caption}>점수 입력 · 결과 확정 · 대진표 운영은 운영자 안내 후 순차적으로 제공됩니다.</Text></InfoCard></ParticipantRouteScaffold>;
}

export function NotificationsScreen() {
  const { notifications, routeStatus } = useParticipantFlow();
  return <ParticipantRouteScaffold active="notifications"><PageHero testID="notifications-layout-hero" eyebrow="알림" title="중요한 안내를 모았어요" caption="대회 신청, 결제, 1:1 문의 답변을 놓치지 마세요." /><InfoCard testID="notifications-screen"><RouteStatusNotice status={routeStatus.notifications} />{notifications.length ? notifications.map((notification) => <StatusListCard key={notification.notificationId} title={notification.title} meta={notification.body} caption={new Date(notification.createdAt).toLocaleDateString('ko-KR')} />) : <Text testID="notifications-empty" style={styles.caption}>아직 표시할 알림이 없습니다. 대회 신청, 1:1 문의 답변, 운영자 공지가 생기면 여기에 표시됩니다.</Text>}</InfoCard></ParticipantRouteScaffold>;
}

export function MyPageScreen() {
  const { profile, application, paymentRecords, routeStatus, tournamentDivisions } = useParticipantFlow();
  const availableDivisions = getAvailableDivisions(tournamentDivisions);
  const paymentCopy = paymentRecords[0] ? `${paymentRecords[0].status} · ${paymentRecords[0].amountKrw.toLocaleString('ko-KR')}원 · 오프라인 운영자 확인` : '결제 내역 없음 · 오프라인 결제는 운영자 확인 대기';
  const recentApplicationCopy = application ? `최근 신청 · 접수 부문 ${getApplicationDivisionName(application, availableDivisions)}` : undefined;
  return <ParticipantRouteScaffold active="mypage"><PageHero testID="mypage-layout-hero" eyebrow="마이" title={`${profile.displayName}님`} caption="내 신청, 결제, DUPR, 고객센터를 관리하세요." /><InfoCard testID="mypage-screen" title="프로필"><RouteStatusNotice status={routeStatus.mypage} /><InfoListItem label="DUPR" value={hasRequiredDupr(profile) ? `${profile.duprId}` : '미등록'} /><InfoListItem label="소속" value="송파피클볼클럽" /><Text testID="mypage-payment-status" style={styles.bodyCopy}>{paymentCopy}</Text>{recentApplicationCopy ? <Text testID="mypage-recent-application" style={styles.caption}>{recentApplicationCopy}</Text> : null}</InfoCard><InfoCard title="빠른 메뉴"><ActionButton testID="mypage-reservations-button" label="예약 내역" secondary onPress={() => router.push('/reservation-history')} /><ActionButton testID="mypage-profile-edit-button" label="프로필 수정" secondary onPress={() => router.push('/profile-edit')} /><ActionButton testID="mypage-dupr-button" label="DUPR 정보 관리" secondary onPress={() => router.push('/dupr-profile')} /><ActionButton testID="mypage-notification-settings-button" label="알림 설정" secondary onPress={() => router.push('/notification-settings')} /><ActionButton testID="mypage-support-button" label="고객센터" secondary onPress={() => router.push('/support')} /></InfoCard><InfoCard title="계정"><Text style={styles.caption}>프로필 수정 · 내 경기 기록 · 결제 내역 · DUPR 정보 관리 · 알림 설정 · 고객센터 · 로그아웃</Text><ActionButton testID="mypage-account-withdrawal-button" label="회원탈퇴 안내" secondary onPress={() => router.push('/account-withdrawal')} /></InfoCard></ParticipantRouteScaffold>;
}

export function ReservationHistoryScreen() {
  const { application, paymentRecords, featuredTournament, tournamentDivisions, routeStatus } = useParticipantFlow();
  const availableDivisions = getAvailableDivisions(tournamentDivisions);
  const paymentRecord = paymentRecords[0];
  const reservationTitle = application ? featuredTournament.title : '예약 내역이 없습니다';
  const divisionName = application ? getApplicationDivisionName(application, availableDivisions) : '대회 신청 후 예약 내역이 표시됩니다';
  const paymentCopy = paymentRecord ? `${paymentRecord.amountKrw.toLocaleString('ko-KR')}원 · ${paymentRecord.status}` : '오프라인 결제는 운영자 확인 후 안내됩니다';

  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="reservation-history-hero" eyebrow="예약 내역" title="내 예약을 확인하세요" caption="신청한 대회와 결제 안내 상태를 한곳에서 확인합니다." />
      <InfoCard testID="reservation-history-screen" title={reservationTitle}>
        <RouteStatusNotice status={routeStatus.mypage} />
        <InfoListItem label="부문" value={divisionName} />
        <InfoListItem label="상태" value={application?.status ?? '신청 전'} />
        <InfoListItem label="결제" value={paymentCopy} />
        <Text style={styles.caption}>참가자 직접 취소와 환불은 1:1 문의로 운영자가 확인합니다.</Text>
      </InfoCard>
      <ActionButton testID="reservation-support-button" label="예약/환불 문의하기" secondary onPress={() => router.push('/support')} />
    </ParticipantRouteScaffold>
  );
}

export function ProfileEditScreen() {
  const { profile } = useParticipantFlow();

  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="profile-edit-hero" eyebrow="프로필 수정" title="기본 정보를 확인하세요" caption="이름, 소속, DUPR 정보는 참가 신청과 대회 운영에 사용됩니다." />
      <InfoCard testID="profile-edit-screen" title="기본 정보">
        <InfoListItem label="이름" value={profile.displayName} />
        <InfoListItem label="소속" value="송파피클볼클럽" />
        <InfoListItem label="DUPR" value={hasRequiredDupr(profile) ? `${profile.duprId}` : '미등록'} />
        <Text style={styles.caption}>연락처와 본인 확인 정보 변경은 운영자 확인 후 반영됩니다.</Text>
      </InfoCard>
      <ActionButton testID="profile-edit-dupr-button" label="DUPR 정보 수정" secondary onPress={() => router.push('/dupr-profile')} />
    </ParticipantRouteScaffold>
  );
}


function TerminalTournamentCard({ testID, compact = false }: { testID?: string; compact?: boolean }) {
  const { featuredTournament } = useParticipantFlow();
  return (
    <InfoCard testID={testID} title={featuredTournament.title}>
      <InfoListItem label="부문" value="남자복식 · 김민준 / 이서연" />
      <InfoListItem label="일정" value={compact ? '8월 9일 (토) · 오전 9:00' : formatTournamentDate(featuredTournament.startsAt)} />
      <InfoListItem label="장소" value={featuredTournament.location} />
    </InfoCard>
  );
}

export function PaymentScreen() {
  const { application, featuredTournament, paymentRecords, profile, tournamentDivisions } = useParticipantFlow();
  const paymentRecord = paymentRecords[0];
  const divisionName = getApplicationDivisionName(application, getAvailableDivisions(tournamentDivisions), getAvailableDivisions(tournamentDivisions)[0]);
  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="payment-screen" eyebrow="결제 안내" title="오프라인 결제 안내를 확인하세요" caption="신청 접수 후 운영자가 결제 방법과 확인 상태를 안내합니다." />
      <InfoCard testID="payment-order-summary" title={featuredTournament.title}>
        <InfoListItem label="참가자" value={profile.displayName} />
        <InfoListItem label="신청 부문" value={application ? divisionName : '신청 접수 후 확인'} />
        <InfoListItem label="안내 금액" value={paymentAmountCopy(paymentRecord)} />
      </InfoCard>
      <InfoCard testID="payment-method" title="결제 방식"><Text style={styles.statusStrong}>운영자 오프라인 확인</Text><Text style={styles.caption}>{paymentRecord?.operatorNote ?? '결제 수단과 입금 확인은 운영자 안내를 따릅니다.'}</Text></InfoCard>
      <InfoCard title="환불 규정"><Text style={styles.caption}>대회 3일 전까지 100% · 3일 이내 불가 · 주최 측 취소 시 전액 환불. 취소와 환불은 1:1 문의로 운영자가 확인합니다.</Text></InfoCard>
      <Text testID="payment-local-notice" style={styles.blockerText}>이 화면에서는 결제가 진행되지 않습니다.</Text>
      <ActionButton testID="payment-support-button" label="결제 문의하기" onPress={() => router.push('/support')} />
    </ParticipantRouteScaffold>
  );
}

export function PaymentCompleteScreen() {
  const { paymentRecords } = useParticipantFlow();
  const paymentRecord = paymentRecords[0];
  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="payment-complete-hero" eyebrow="결제완료" title="결제가 완료되었어요" caption="참가 신청이 확정됐습니다" />
      <TerminalTournamentCard testID="payment-complete-screen" />
      <InfoCard title="결제 정보">
        <InfoListItem label="결제금액" value={paymentAmountCopy(paymentRecord)} />
        <InfoListItem label="결제일시" value="2026.07.30 14:22" />
        <InfoListItem label="결제수단" value={paymentMethodCopy(paymentRecord)} />
        <Text style={styles.statusStrong}>대회까지 D-5</Text>
      </InfoCard>
      <ActionButton testID="payment-complete-games-button" label="내 경기 보기" onPress={() => router.push('/games')} />
      <ActionButton testID="payment-complete-home-button" label="홈으로" secondary onPress={() => router.push('/tournaments')} />
    </ParticipantRouteScaffold>
  );
}

export function CancelConfirmScreen() {
  const { paymentRecords } = useParticipantFlow();
  const paymentRecord = paymentRecords[0];
  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="cancel-confirm-hero" eyebrow="참가 취소" title="참가 취소" caption="환불 정책과 신청 정보를 확인하세요." />
      <TerminalTournamentCard testID="cancel-confirm-screen" />
      <InfoCard title="환불 예정 금액">
        <InfoListItem label="결제금액" value={paymentAmountCopy(paymentRecord)} />
        <InfoListItem label="결제수단" value={paymentMethodCopy(paymentRecord)} />
        <Text style={styles.statusStrong}>3일 전 취소 · 100% 환불 대상</Text>
        <Text style={styles.priceText}>{paymentAmountCopy(paymentRecord)}</Text>
      </InfoCard>
      <InfoCard title="환불 규정"><Text style={styles.caption}>대회 3일 전까지 취소: 100% 환불{`
`}대회 3일 이내 취소: 환불 불가{`
`}주최 측 사정으로 취소 시: 전액 환불{`
`}환불은 결제수단으로 영업일 기준 3~5일 소요돼요</Text></InfoCard>
      <InfoCard title="취소 사유 (선택)"><View style={styles.actionRow}>{['실수 신청', '일정 변경', '개인 사정', '기타'].map((reason) => <Text key={reason} style={styles.secondaryPill}>{reason}</Text>)}</View><Text style={styles.caption}>취소 확정 후에는 되돌릴 수 없으며, 위 환불 정책에 따라 처리돼요</Text></InfoCard>
      <ActionButton testID="cancel-confirm-button" label="취소 확정하기" onPress={() => router.push('/cancel-complete')} />
    </ParticipantRouteScaffold>
  );
}

export function CancelCompleteScreen() {
  const { paymentRecords } = useParticipantFlow();
  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="cancel-complete-hero" eyebrow="취소 완료" title="취소가 완료됐어요" caption="환불은 영업일 기준 3~5일 이내 처리돼요" />
      <TerminalTournamentCard testID="cancel-complete-screen" />
      <InfoCard title="환불 정보"><InfoListItem label="환불 금액" value={paymentAmountCopy(paymentRecords[0])} /><InfoListItem label="환불 예정일" value="2026.08.04 (예상)" /><InfoListItem label="환불 수단" value={paymentMethodCopy(paymentRecords[0])} /></InfoCard>
      <ActionButton testID="cancel-complete-reservations-button" label="예약내역 보기" onPress={() => router.push('/reservation-history')} />
      <ActionButton testID="cancel-complete-home-button" label="홈으로" secondary onPress={() => router.push('/tournaments')} />
    </ParticipantRouteScaffold>
  );
}

export function PaymentFailureScreen() {
  const { paymentRecords } = useParticipantFlow();
  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="payment-failure-hero" eyebrow="결제실패" title="결제에 실패했어요" caption="카드 승인이 거절됐어요. 다시 시도해주세요" />
      <TerminalTournamentCard testID="payment-failure-screen" />
      <InfoCard title="결제 정보"><InfoListItem label="결제금액" value={paymentAmountCopy(paymentRecords[0])} /><InfoListItem label="실패 일시" value="2026.07.30 14:22" /><InfoListItem label="결제수단" value={paymentMethodCopy(paymentRecords[0])} /><Text style={styles.blockerText}>실패 사유: 카드 한도 초과 (카드사 승인 거절)</Text></InfoCard>
      <ActionButton testID="payment-failure-retry-button" label="다시 결제하기" onPress={() => router.push('/payment-complete')} />
      <ActionButton testID="payment-failure-home-button" label="홈으로" secondary onPress={() => router.push('/tournaments')} />
    </ParticipantRouteScaffold>
  );
}

export function InviteDetailScreen() {
  const { profile, featuredTournament } = useParticipantFlow();
  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="invite-detail-hero" eyebrow="초대장" title="피클볼 대회 파트너 초대장" caption={`${featuredTournament.title} · 남자복식 · 8월 9일 (토)`} />
      <InfoCard testID="invite-detail-screen" title={profile.displayName}><Text style={styles.badge}>파트너 대기중</Text><Text style={styles.bigDupr}>PICKLE-7X9K2</Text><ActionButton testID="invite-kakao-button" label="카카오톡으로 초대하기" onPress={() => undefined} /><ActionButton testID="invite-copy-button" label="초대 링크 복사하기" secondary onPress={() => undefined} /><Text style={styles.statusStrong}>대기중</Text><Text style={styles.caption}>{inviteCountdownCopy()}</Text></InfoCard>
      <ActionButton testID="invite-resend-button" label="링크 재발송 (최대 3회)" secondary onPress={() => undefined} />
    </ParticipantRouteScaffold>
  );
}

export function PartnerAcceptScreen() {
  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID="partner-accept-hero" eyebrow="파트너 수락" title="김민준님이 파트너로 초대했어요" caption="수락하면 대표자가 신청 및 결제를 진행합니다" />
      <TerminalTournamentCard testID="partner-accept-screen" compact />
      <InfoCard title="초대자 김민준 · DUPR 4.2"><Text style={styles.caption}>{inviteCountdownCopy()}</Text></InfoCard>
      <ActionButton testID="partner-accept-button" label="초대 수락하기" onPress={() => router.push('/payment-complete')} />
      <ActionButton testID="partner-decline-button" label="거절하기" secondary onPress={() => router.push('/partner-declined')} />
    </ParticipantRouteScaffold>
  );
}

function InviteTerminalScreen({ testID, heroTestID, eyebrow, title, caption }: { testID: string; heroTestID: string; eyebrow: string; title: string; caption: string }) {
  return (
    <ParticipantRouteScaffold active="mypage">
      <PageHero testID={heroTestID} eyebrow={eyebrow} title={title} caption={caption} />
      <TerminalTournamentCard testID={testID} compact />
      <ActionButton testID={`${testID}-reinvite-button`} label="다른 파트너 초대하기" onPress={() => router.push('/invite')} />
      <ActionButton testID={`${testID}-cancel-button`} label="참가 취소하기" secondary onPress={() => router.push('/cancel-confirm')} />
    </ParticipantRouteScaffold>
  );
}

export function InviteExpiredScreen() {
  return <InviteTerminalScreen testID="invite-expired-screen" heroTestID="invite-expired-hero" eyebrow="초대 만료" title="초대 링크가 만료됐어요" caption="72시간 내 응답이 없었어요. 다시 초대하거나 취소해주세요" />;
}

export function PartnerDeclinedScreen() {
  return <InviteTerminalScreen testID="partner-declined-screen" heroTestID="partner-declined-hero" eyebrow="초대 결과" title="이서연님이 초대를 거절했어요" caption="다른 파트너를 초대하거나 참가를 취소할 수 있어요" />;
}

const bracketRounds = [
  { title: '8강', matches: [
    ['8월 9일 · 코트 1', '김민준/이서연 vs 박지훈/정수빈', '11:7, 9:11, 11:8 · 승리'],
    ['8월 9일 · 코트 2', '최현우/송지민 vs 윤태옥/조성민', '11:5, 11:9 · 승리'],
    ['8월 9일 · 코트 3', '강태양/이하늘 vs 정우진/한소미', '9:11, 11:6, 8:11 · 승리'],
    ['8월 9일 · 코트 4', '배수현/오지훈 vs 신동엽/유아름', '11:4, 11:9 · 승리'],
  ] },
  { title: '4강', matches: [
    ['8월 9일 · 코트 1', '김민준/이서연 vs 최현우/송지민', '11:6, 11:8 · 승리'],
    ['8월 9일 · 코트 2', '강태양/이하늘 vs 배수현/오지훈', '11:9, 9:11, 11:7 · 승리'],
  ] },
] as const;

export function BracketScreen() {
  return (
    <ParticipantRouteScaffold active="games">
      <View testID="bracket-screen" style={styles.heroCard}>
        <PageHero testID="bracket-hero" eyebrow="토너먼트" title="대진표" caption="2026 협회장배 전국오픈 · 남자복식" />
        {bracketRounds.map((round) => <View key={round.title} style={styles.sectionCard}><Text style={styles.sectionTitleSmall}>{round.title}</Text>{round.matches.map(([date, teams, result]) => <StatusListCard key={`${date}-${teams}`} title={teams} meta={date} caption={result} />)}</View>)}
        <InfoCard testID="bracket-final-card" title="결승"><StatusListCard title="김민준/이서연 vs 강태양/이하늘" meta="8월 9일 · 센터코트" caption="11:8, 9:11, 11:6 · 우승" badgeText="우승" /></InfoCard>
      </View>
    </ParticipantRouteScaffold>
  );
}

const setScores = [['1세트', '11', '7'], ['2세트', '9', '11'], ['3세트', '11', '8']] as const;

function MatchSummary() {
  return <InfoCard title="8월 9일 (토) · 코트 3"><Text style={styles.cardTitle}>김민준/이서연 vs 박지훈/정수빈</Text></InfoCard>;
}

export function ScoreEntryScreen() {
  return (
    <ParticipantRouteScaffold active="games">
      <View testID="score-entry-screen" style={styles.heroCard}>
        <PageHero testID="score-entry-hero" eyebrow="경기 결과" title="점수 입력" />
        <MatchSummary />
        <InfoCard title="세트별 점수">{setScores.map(([set, ours, theirs]) => <InfoListItem key={set} label={set} value={`${ours} : ${theirs} · 우리 팀 / 상대 팀`} />)}</InfoCard>
        <Text style={styles.statusStrong}>입력한 결과는 상대팀 확인 후 확정됩니다</Text>
        <ActionButton testID="score-entry-submit-button" label="결과 제출하기" onPress={() => router.push('/result-confirm')} />
      </View>
    </ParticipantRouteScaffold>
  );
}

export function ResultConfirmScreen() {
  return (
    <ParticipantRouteScaffold active="games">
      <View testID="result-confirm-screen" style={styles.heroCard}>
        <PageHero testID="result-confirm-hero" eyebrow="경기 결과" title="결과 확인" />
        <MatchSummary />
        <InfoCard title="제출된 결과"><Text style={styles.statusStrong}>승리: 김민준/이서연 (2:1)</Text>{setScores.map(([set, ours, theirs]) => <InfoListItem key={set} label={set} value={`${ours} : ${theirs}`} />)}<Text style={styles.caption}>김민준님이 8월 9일 14:32에 입력</Text></InfoCard>
        <Text style={styles.caption}>내용이 맞으면 확인하고, 다르면 이의를 제기해주세요</Text>
        <ActionButton testID="result-confirm-button" label="내용이 맞아요, 확인하기" onPress={() => router.push('/final-results')} />
        <ActionButton testID="result-dispute-button" label="이의 제기하기" secondary onPress={() => router.push('/dispute')} />
      </View>
    </ParticipantRouteScaffold>
  );
}

export function SignupCompleteScreen() {
  const { profile } = useParticipantFlow();
  return (
    <ParticipantRouteScaffold active="tournaments">
      <View testID="signup-complete-screen" style={styles.heroCard}>
        <PageHero testID="signup-complete-hero" eyebrow="가입 완료" title="회원가입이 완료됐어요" caption="Happickle와 함께 대회를 즐겨보세요" />
        <InfoCard title={`${profile.displayName}님, 반가워요!`}><Text style={styles.bodyCopy}>DUPR {profile.duprId ?? '미등록'} · 송파피클볼클럽</Text></InfoCard>
        <ActionButton testID="signup-complete-button" label="시작하기" onPress={() => router.push('/tournaments')} />
      </View>
    </ParticipantRouteScaffold>
  );
}

export function DisputeScreen() {
  return (
    <ParticipantRouteScaffold active="games">
      <View testID="dispute-screen" style={styles.heroCard}>
        <PageHero testID="dispute-hero" eyebrow="경기 결과" title="이의 제기" />
        <MatchSummary />
        <InfoCard title="제출된 결과"><Text style={styles.statusStrong}>11:7, 9:11, 11:8 (2:1 승)</Text></InfoCard>
        <InfoCard title="이의 제기 사유"><TextInput testID="dispute-reason-input" accessibilityLabel="이의 제기 사유" multiline maxLength={200} placeholder={'어떤 부분이 다른지 구체적으로 적어주세요\n예: 2세트 점수가 9:11이 아니라 11:9입니다'} placeholderTextColor={palette.muted} style={[styles.input, styles.multilineInput]} /><Text style={styles.caption}>제출하면 주최자가 확인 후 결과를 수정·확정합니다</Text></InfoCard>
        <ActionButton testID="dispute-submit-button" label="이의 제기 제출하기" onPress={() => router.push('/dispute-complete')} />
      </View>
    </ParticipantRouteScaffold>
  );
}

export function DisputeCompleteScreen() {
  return (
    <ParticipantRouteScaffold active="games">
      <View testID="dispute-complete-screen" style={styles.heroCard}>
        <PageHero testID="dispute-complete-hero" eyebrow="접수 완료" title="이의 제기가 접수됐어요" caption="주최측 확인 후 24시간 내 결과가 조정돼요" />
        <InfoCard title="2026 협회장배 전국오픈"><InfoListItem label="제출한 결과" value="11:7, 9:11, 11:8" /><InfoListItem label="이의 제기 사유" value="2세트 점수가 실제와 달라요" /><InfoListItem label="처리 예정" value="24시간 이내 확인" /></InfoCard>
        <ActionButton testID="dispute-complete-games-button" label="내 경기로 돌아가기" onPress={() => router.push('/games')} />
        <ActionButton testID="dispute-complete-home-button" label="홈으로" secondary onPress={() => router.push('/tournaments')} />
      </View>
    </ParticipantRouteScaffold>
  );
}

const notificationSettingRows = [
  ['game-call', '경기 호출 알림', '내 경기 호출 시 알려드려요', true],
  ['tournament-notice', '대회 공지 알림', '참가 대회의 새 공지를 알려드려요', true],
  ['partner-invite', '파트너 초대 알림', '복식 파트너 초대/수락 알림', true],
  ['payment-refund', '결제/환불 알림', '결제 완료/환불 처리 알림', true],
  ['marketing', '마케팅 정보 수신', '이벤트·혜택 정보 수신 (선택)', false],
] as const;

export function NotificationSettingsScreen() {
  const [preferences, setPreferences] = useState<Record<string, boolean>>(() => Object.fromEntries(notificationSettingRows.map(([key, , , enabled]) => [key, enabled])));
  return (
    <ParticipantRouteScaffold active="mypage">
      <View testID="notification-settings-screen" style={styles.heroCard}>
        <PageHero testID="notification-settings-hero" eyebrow="마이" title="알림 설정" caption="이 기기에서 표시할 알림을 선택하세요. 설정은 현재 화면에만 임시로 유지됩니다." />
        <InfoCard title="알림 항목">{notificationSettingRows.map(([key, title, caption]) => <Pressable key={key} testID={`notification-setting-${key}`} accessibilityRole="switch" accessibilityState={{ checked: preferences[key] }} onPress={() => setPreferences((current) => ({ ...current, [key]: !current[key] }))} style={styles.infoListItem}><Text style={styles.rowRight}>{title} · {preferences[key] ? '켜짐' : '꺼짐'}</Text><Text style={styles.caption}>{caption}</Text></Pressable>)}</InfoCard>
      </View>
    </ParticipantRouteScaffold>
  );
}

export function AccountWithdrawalScreen() {
  const { profile } = useParticipantFlow();

  return (
    <ParticipantRouteScaffold active="mypage">
      <View testID="account-withdrawal-screen" style={styles.heroCard}>
        <PageHero testID="account-withdrawal-hero" eyebrow="회원탈퇴" title="회원탈퇴 안내" caption="계정 삭제는 본인 확인과 운영자 확인이 필요한 민감 작업입니다." />
        <InfoCard title="탈퇴 전 확인사항">
          <InfoListItem label="계정" value={profile.displayName} />
          <InfoListItem label="대회 신청" value="진행 중인 신청·결제·환불 내역 확인 필요" />
          <Text style={styles.caption}>참가 신청, 결제 확인, 환불, 경기 기록이 남아 있는 경우 고객센터 확인 후 처리됩니다.</Text>
        </InfoCard>
        <InfoCard testID="account-withdrawal-disabled-state" title="현재 화면 동작">
          <Text style={styles.blockerText}>이 미리보기에서는 회원탈퇴가 실행되지 않습니다.</Text>
          <Text style={styles.caption}>실제 계정 삭제, 개인정보 삭제, DB/API 호출은 별도 승인과 본인 확인 후 처리해야 합니다.</Text>
        </InfoCard>
        <ActionButton testID="account-withdrawal-disabled-button" label="회원탈퇴 요청하기 (비활성)" onPress={() => undefined} disabled />
        <ActionButton testID="account-withdrawal-support-button" label="고객센터로 문의하기" secondary onPress={() => router.push('/support')} />
      </View>
    </ParticipantRouteScaffold>
  );
}

const finalRanks = [
  ['1', '박지훈 · 정수빈', '9승 1패'],
  ['2', '최현우 · 송지민', '8승 2패'],
  ['3', '윤태욱 · 조성민', '7승 3패'],
] as const;

export function FinalResultsScreen() {
  return (
    <ParticipantRouteScaffold active="games">
      <View testID="final-results-screen" style={styles.heroCard}>
        <PageHero testID="final-results-hero" eyebrow="대회가 종료되었습니다" title="2026 협회장배 전국오픈" caption="남자복식 최종 결과" />
        <InfoCard title="최종 순위">{finalRanks.map(([rank, team, record]) => <InfoListItem key={rank} label={`${rank}위`} value={`${team} · ${record}`} />)}</InfoCard>
        <InfoCard title="내 최종 순위"><Text style={styles.bigDupr}>5위</Text><Text style={styles.bodyCopy}>김민준 · 이서연 · 8승 3패</Text></InfoCard>
        <ActionButton testID="final-results-bracket-button" label="전체 대진표 보기" secondary onPress={() => router.push('/bracket')} />
        <ActionButton testID="final-results-home-button" label="홈으로" onPress={() => router.push('/tournaments')} />
      </View>
    </ParticipantRouteScaffold>
  );
}

const fontSans = 'Noto Sans KR, Inter, SF Pro Display, system-ui, sans-serif';
const fontMono = 'JetBrains Mono, SF Mono, Menlo, monospace';

const styles = StyleSheet.create({
  loginScreen: { flex: 1, alignItems: 'center', backgroundColor: palette.bg, minHeight: 640 },
  phoneFrame: { alignItems: 'center', backgroundColor: palette.bg, maxWidth: 480, minHeight: 640, width: '100%' },
  loginMain: { alignItems: 'center', width: '100%' },
  logoImage: { height: 46, marginTop: 150, width: 146 },
  logoImageSmall: { height: 40, width: 126 },
  hiddenParityText: { height: 0, opacity: 0 },
  tagline: { color: palette.muted, fontFamily: fontSans, fontSize: 12, fontWeight: '500', marginTop: 5, textAlign: 'center' },
  illWrap: { alignItems: 'center', backgroundColor: palette.mint, borderRadius: 42, height: 84, justifyContent: 'center', marginTop: 30, width: 84 },
  illIcon: { color: palette.brand, fontSize: 38, fontWeight: '500', lineHeight: 40 },
  illHandle: { color: palette.brand, fontSize: 28, lineHeight: 28, marginTop: -16 },
  btn: { alignItems: 'center', borderRadius: 14, height: 52, justifyContent: 'center', maxWidth: 400, width: '83%' },
  kakaoButton: { backgroundColor: palette.kakao, marginTop: 56 },
  kakaoButtonText: { color: palette.kakaoInk, fontFamily: fontSans, fontSize: 15, fontWeight: '700' },
  appleButton: { backgroundColor: palette.ink, marginTop: 12 },
  appleButtonText: { color: '#ffffff', fontFamily: fontSans, fontSize: 15, fontWeight: '700' },
  hint: { color: palette.muted, fontFamily: fontSans, fontSize: 12, fontWeight: '500', marginBottom: 114, marginTop: 16, textAlign: 'center' },
  participantShell: { backgroundColor: palette.bg, flex: 1 },
  page: { flex: 1, backgroundColor: palette.bg },
  content: { alignSelf: 'center', gap: 16, maxWidth: 480, padding: 20, paddingBottom: 112, width: '100%' },
  header: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, paddingTop: 16 },
  headerSubtitle: { alignSelf: 'flex-start', backgroundColor: palette.softGreen, borderRadius: 999, color: palette.success, fontFamily: fontSans, fontSize: 12, fontWeight: '800', marginTop: 6, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  headerBell: { alignItems: 'center', backgroundColor: '#dfeee2', borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  headerBellIcon: { color: palette.ink, fontFamily: fontSans, fontSize: 20, fontWeight: '900' },
  heroCard: { gap: 18, paddingBottom: 2 },
  pageHero: { backgroundColor: palette.mint, borderRadius: 28, gap: 12, overflow: 'hidden', padding: 18 },
  heroTitle: { color: palette.ink, fontFamily: fontSans, fontSize: 28, fontWeight: '900', lineHeight: 34 },
  searchBox: { backgroundColor: palette.surface, borderRadius: 14, elevation: 2, paddingHorizontal: 16, paddingVertical: 16, shadowColor: '#94a3a1', shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.12, shadowRadius: 18 },
  searchText: { color: palette.muted, fontFamily: fontSans, fontSize: 15 },
  filterToolbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { backgroundColor: palette.surface, borderColor: palette.line, borderRadius: 999, borderWidth: 1, color: palette.ink, fontFamily: fontSans, fontSize: 13, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 10 },
  locationChip: { backgroundColor: '#e8f3eb', borderColor: '#c7dfcc', color: palette.success },
  statusChip: { backgroundColor: palette.surface, borderColor: palette.line, borderRadius: 999, borderWidth: 1, color: palette.ink, fontFamily: fontSans, fontSize: 13, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 10 },
  activeChip: { backgroundColor: palette.softGreen, color: palette.success },
  sectionTitleSmall: { color: palette.ink, fontFamily: fontSans, fontSize: 18, fontWeight: '900' },
  tournamentCard: { backgroundColor: palette.surface, borderColor: palette.line, borderRadius: 20, borderWidth: 1, gap: 9, overflow: 'hidden', paddingBottom: 18 },
  tournamentCardBody: { gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  cardTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  badgeRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  badge: { alignSelf: 'flex-start', backgroundColor: palette.softGreen, borderRadius: 999, color: palette.success, fontFamily: fontSans, fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  dDay: { color: palette.success, fontFamily: fontSans, fontSize: 12, fontWeight: '900' },
  liveBadge: { alignSelf: 'flex-start', backgroundColor: '#ffe4e6', borderRadius: 999, color: palette.live, fontFamily: fontSans, fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  countText: { color: palette.muted, fontFamily: fontSans, fontSize: 12, fontWeight: '700' },
  cardTitle: { color: palette.ink, fontFamily: fontSans, fontSize: 18, fontWeight: '900', lineHeight: 24 },
  bodyCopy: { color: palette.ink, fontFamily: fontSans, fontSize: 15, lineHeight: 22 },
  divisionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  divisionChip: { backgroundColor: '#f3f4f6', borderRadius: 999, color: palette.ink, fontFamily: fontSans, fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5 },
  priceText: { color: palette.ink, fontFamily: fontSans, fontSize: 16, fontWeight: '900', lineHeight: 24 },
  secondaryTournament: { borderTopColor: palette.line, borderTopWidth: 1, gap: 4, marginTop: 8, paddingTop: 12 },
  sectionCard: { backgroundColor: palette.surface, borderColor: palette.line, borderRadius: 24, borderWidth: 1, gap: 12, padding: 18 },
  infoCard: { backgroundColor: palette.surface, borderColor: palette.line, borderRadius: 22, borderWidth: 1, gap: 12, padding: 16 },
  infoListItem: { alignItems: 'flex-start', borderBottomColor: '#eef2ee', borderBottomWidth: 1, gap: 3, paddingBottom: 10 },
  statusListCard: { backgroundColor: '#f9fafb', borderColor: '#eef2ee', borderRadius: 18, borderWidth: 1, gap: 6, padding: 14 },
  sectionLabel: { color: palette.success, fontFamily: fontSans, fontSize: 13, fontWeight: '900' },
  sectionTitle: { color: palette.ink, fontFamily: fontSans, fontSize: 22, fontWeight: '900', lineHeight: 28 },
  infoRow: { gap: 4 },
  rowRight: { color: palette.ink, fontFamily: fontSans, fontSize: 15, fontWeight: '800', lineHeight: 22 },
  choiceCard: { backgroundColor: '#f9fafb', borderRadius: 18, gap: 4, padding: 14 },
  choiceCardMuted: { backgroundColor: '#f3f4f6', borderRadius: 18, gap: 4, opacity: 0.72, padding: 14 },
  choiceTitle: { color: palette.ink, fontFamily: fontSans, fontSize: 17, fontWeight: '900' },
  caption: { color: palette.muted, fontFamily: fontSans, fontSize: 13, lineHeight: 19 },
  linkText: { color: palette.success, fontFamily: fontSans, fontSize: 14, fontWeight: '900' },
  duprCard: { backgroundColor: palette.mint, borderRadius: 24, gap: 12, padding: 18 },
  bigDupr: { color: palette.ink, fontFamily: fontSans, fontSize: 34, fontWeight: '900' },
  input: { backgroundColor: palette.surface, borderColor: palette.line, borderRadius: 14, borderWidth: 1, color: palette.ink, fontFamily: fontSans, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  multilineInput: { minHeight: 132, textAlignVertical: 'top' },
  secondaryAction: { alignItems: 'center', backgroundColor: palette.surface, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
  secondaryActionText: { color: palette.ink, fontFamily: fontSans, fontSize: 15, fontWeight: '900' },
  statusStrong: { color: palette.success, fontFamily: fontSans, fontSize: 14, fontWeight: '900' },
  blockerText: { color: palette.warning, fontFamily: fontSans, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  primaryAction: { alignItems: 'center', backgroundColor: palette.success, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14 },
  disabledAction: { opacity: 0.55 },
  primaryActionText: { color: '#ffffff', fontFamily: fontSans, fontSize: 16, fontWeight: '900' },
  supportCard: { backgroundColor: '#eef2ff', borderRadius: 24, gap: 12, padding: 18 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryPill: { backgroundColor: palette.surface, borderRadius: 999, color: palette.ink, fontFamily: fontSans, fontSize: 13, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 8 },
  selectedPill: { backgroundColor: palette.brand, color: palette.surface },
  courtPreview: { backgroundColor: palette.mint, height: 150, overflow: 'hidden' },
  courtLineTop: { backgroundColor: 'transparent', borderColor: '#5b9566', borderTopWidth: 3, height: 58, left: 70, position: 'absolute', right: 70, top: 22, transform: [{ skewX: '-22deg' }] },
  courtLineMid: { backgroundColor: '#91b99b', height: 2, left: 62, position: 'absolute', right: 62, top: 70 },
  courtLineBottom: { backgroundColor: '#91b99b', height: 2, left: 62, position: 'absolute', right: 62, top: 98 },
  courtCenterLine: { backgroundColor: '#91b99b', height: 112, left: '50%', position: 'absolute', top: 22, width: 2 },
  courtDot: { backgroundColor: '#6b7280', borderRadius: 999, height: 18, position: 'absolute', top: 32, width: 18 },
  courtDotTopLeft: { left: '33%' },
  courtDotTopRight: { right: '33%' },
  courtDotLive: { backgroundColor: '#f7c844' },
  courtDotCenter: { backgroundColor: '#f4bf35', borderColor: palette.ink, borderRadius: 999, borderWidth: 1, height: 14, left: '50%', marginLeft: -7, position: 'absolute', top: 72, width: 14 },
  courtNet: { backgroundColor: palette.ink, height: 4, left: 24, position: 'absolute', right: 24, top: 78 },
  courtNetHandleLeft: { backgroundColor: palette.ink, borderRadius: 999, height: 10, left: 20, position: 'absolute', top: 75, width: 10 },
  courtNetHandleRight: { backgroundColor: palette.ink, borderRadius: 999, height: 10, position: 'absolute', right: 20, top: 75, width: 10 },
  courtPlayer: { backgroundColor: '#569665', borderRadius: 999, height: 22, position: 'absolute', top: 112, width: 22 },
  courtPlayerLeft: { left: '31%' },
  courtPlayerRight: { right: '31%' },
  bottomNav: { alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.line, borderRadius: 0, borderWidth: 1, bottom: 0, flexDirection: 'row', justifyContent: 'space-around', left: 0, paddingVertical: 14, position: 'absolute', right: 0 },
  navButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  navButtonActive: { backgroundColor: palette.softGreen },
  bottomNavItem: { color: palette.ink, fontFamily: fontSans, fontSize: 13, fontWeight: '800' },
  bottomNavItemActive: { color: palette.success },
});
