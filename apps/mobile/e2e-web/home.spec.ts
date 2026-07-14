import { expect, test } from '@playwright/test';
import { participantApplicationErrorCodeSchema } from '../../../packages/contracts/dist/index.js';

const REQUIRED_DUPR_ERROR = participantApplicationErrorCodeSchema.enum.DUPR_PROFILE_REQUIRED;

test('login-first screen exposes social login before DUPR gated participant flow on RN Web', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Happickle');
  await expect(page.getByTestId('login-artboard')).toBeVisible();
  await expect(page.getByTestId('login-logo')).toHaveAttribute('aria-label', 'Happickle');
  await expect(page.getByTestId('login-subtitle')).toContainText('대한피클볼협회 공식 대회 플랫폼');
  await expect(page.getByTestId('kakao-login-button')).toContainText('카카오로 계속하기');
  await expect(page.getByTestId('apple-login-button')).toContainText('Apple로 계속하기');
  await expect(page.getByTestId('login-consent-copy')).toContainText('자동으로 회원가입이 진행돼요');
  await expect(page.getByTestId('application-cta')).toHaveCount(0);
  await expect(page.getByText(/Admin Web/i)).toHaveCount(0);

  await page.getByTestId('kakao-login-button').click();
  await expect(page).toHaveURL(/\/tournaments$/);
  await expect(page.getByTestId('session-actor')).toContainText('actor_sandbox_social_001');
  await expect(page.getByTestId('mock-tournament-card')).toContainText('PickleHub Open');
  await expect(page.getByTestId('participant-api-mode')).toContainText('총 1개');

  await page.getByTestId('mock-tournament-card').click();
  await expect(page).toHaveURL(/\/tournaments\/tournament_sandbox_001$/);
  await expect(page.getByTestId('tournament-detail')).toContainText('환불 규정');
  await expect(page.getByTestId('tournament-detail')).toContainText('참가자 직접 취소 불가');
  await page.getByTestId('detail-apply-button').click();

  await expect(page).toHaveURL(/\/dupr-profile$/);
  await expect(page.getByTestId('dupr-gate-status')).toContainText('참가 신청 전 DUPR 정보가 필요해요');
  await expect(page.getByTestId('application-cta')).toHaveCount(0);
  await page.getByTestId('dupr-continue-application').click({ force: true });
  await expect(page.getByTestId('application-form')).toHaveCount(0);

  await page.getByTestId('dupr-input').fill('dupr-777');
  await page.getByTestId('save-dupr-button').click();
  await expect(page.getByTestId('saved-dupr')).toContainText('DUPR-777');
  await expect(page.getByTestId('dupr-gate-status')).toContainText('현재 DUPR 저장됨');

  await page.getByTestId('dupr-continue-application').click();
  await expect(page).toHaveURL(/\/tournaments\/tournament_sandbox_001\/apply$/);
  await expect(page.getByTestId('application-blocker')).toHaveCount(0);
  await expect(page.getByTestId('application-cta')).toContainText('참가 신청하기');
  await page.getByTestId('application-cta').click();
  await expect(page.getByTestId('application-submitted')).toContainText('샌드박스 신청 접수됨');
  await expect(page.getByTestId('application-submitted')).toContainText('참가자 직접 취소 불가');

  await page.getByRole('button', { name: '탐색' }).click();
  await expect(page).toHaveURL(/\/tournaments$/);
  await page.getByTestId('go-support-button').last().click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByTestId('support-copy')).toContainText('1:1 문의로 접수');
  await expect(page.getByTestId('support-copy')).toContainText('Participant self-cancel/refund is not available');
  await expect(page.getByTestId('support-center')).toContainText('support@happickle.kr (1:1 문의 접수용)');
  await expect(page.getByTestId('support-copy')).toContainText('DUPR 정보는 어디서 확인하나요?');
  await expect(page.getByTestId('support-copy')).not.toContainText(REQUIRED_DUPR_ERROR);
});
