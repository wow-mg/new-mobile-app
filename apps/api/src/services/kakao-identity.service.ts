import { randomUUID } from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { members, socialIdentities } from '../db/schema.js';

export type KakaoMember = { memberId: string; kakaoUserId: string; email?: string; phone?: string; displayName: string; status: 'active' | 'withdrawn' };
export type KakaoProfile = { kakaoUserId: string; email?: string; phone?: string; displayName: string };
export type KakaoIdentityResult = { action: 'login' | 'signup'; member: KakaoMember } | { action: 'additional_info_required' } | { action: 'blocked'; reason: 'WITHDRAWN_MEMBER' | 'DUPLICATE_EMAIL' | 'DUPLICATE_PHONE'; message: string };

function normalizePhone(phone: string | undefined) {
  const digits = phone?.replace(/\D/g, '');
  if (!digits) return undefined;
  return digits.startsWith('82') ? `0${digits.slice(2)}` : digits;
}

export async function findOrCreateKakaoMember(profile: KakaoProfile): Promise<KakaoIdentityResult> {
  const email = profile.email?.trim().toLowerCase();
  const phone = normalizePhone(profile.phone);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ memberId: members.memberId, email: members.email, phone: members.phone, displayName: members.displayName, status: members.status })
      .from(socialIdentities).innerJoin(members, eq(socialIdentities.memberId, members.memberId))
      .where(and(eq(socialIdentities.provider, 'kakao'), eq(socialIdentities.providerUserId, profile.kakaoUserId))).limit(1);
    if (existing) {
      if (existing.status === 'withdrawn') return { action: 'blocked', reason: 'WITHDRAWN_MEMBER', message: '탈퇴 처리된 계정은 재가입 정책 확인 후 이용할 수 있습니다.' };
      return { action: 'login', member: { ...existing, email: existing.email ?? undefined, phone: existing.phone ?? undefined, status: 'active', kakaoUserId: profile.kakaoUserId } };
    }

    if (!email) return { action: 'additional_info_required' };

    const duplicateConditions = [eq(members.email, email), phone ? eq(members.phone, phone) : undefined].filter(Boolean);
    if (duplicateConditions.length) {
      const [duplicate] = await tx.select({ email: members.email, phone: members.phone }).from(members).where(or(...duplicateConditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])).limit(1);
      if (duplicate?.email === email) return { action: 'blocked', reason: 'DUPLICATE_EMAIL', message: '이미 가입된 이메일입니다.' };
      if (phone && duplicate?.phone === phone) return { action: 'blocked', reason: 'DUPLICATE_PHONE', message: '이미 가입된 연락처입니다.' };
    }

    const memberId = `dev-member-${randomUUID()}`;
    await tx.insert(members).values({ memberId, email, phone, displayName: profile.displayName, status: 'active' });
    await tx.insert(socialIdentities).values({ socialIdentityId: randomUUID(), memberId, provider: 'kakao', providerUserId: profile.kakaoUserId });
    return { action: 'signup', member: { memberId, kakaoUserId: profile.kakaoUserId, email, phone, displayName: profile.displayName, status: 'active' } };
  });
}

export async function markKakaoMemberWithdrawn(kakaoUserId: string) {
  await db.transaction(async (tx) => {
    const [identity] = await tx.select({ memberId: socialIdentities.memberId }).from(socialIdentities)
      .where(and(eq(socialIdentities.provider, 'kakao'), eq(socialIdentities.providerUserId, kakaoUserId))).limit(1);
    if (identity) await tx.update(members).set({ status: 'withdrawn', updatedAt: new Date() }).where(eq(members.memberId, identity.memberId));
  });
}
