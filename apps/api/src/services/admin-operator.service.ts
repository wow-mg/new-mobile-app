import { desc, eq } from 'drizzle-orm';
import {
  adminMemberListResponseSchema,
  adminMemberSchema,
  adminPaymentRecordListResponseSchema,
  adminPaymentRecordSchema,
  adminSupportInquiryListResponseSchema,
  adminSupportInquirySchema,
  adminTournamentApplicationListResponseSchema,
  adminTournamentApplicationSchema,
  type AdminApiErrorCode,
  type RefundRequestStatus,
  type UpdateAdminMemberStatusRequest,
  type UpdateAdminPaymentStatusRequest,
  type UpdateAdminSupportInquiryStatusRequest,
} from '@template/contracts';
import { db } from '../db/client.js';
import { members, paymentRecords, supportInquiries, tournamentApplications } from '../db/schema.js';
import { getParticipantProfile, getTournamentApplication, getMyPage, getSupportCenter } from './participant-mvp.service.js';
import { getRefundService } from './refund.service.js';

const useMemoryStore = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const SANDBOX_MEMBER_ID = 'member_sandbox_001';

export class AdminOperatorError extends Error {
  constructor(message: AdminApiErrorCode, public readonly status: 400 | 403 | 404) {
    super(message);
  }
}

export async function listAdminMembers() {
  if (useMemoryStore) {
    const profile = await getParticipantProfile();
    return adminMemberListResponseSchema.parse({ members: [sandboxMember(profile.displayName)] });
  }
  const rows = await db.select().from(members).orderBy(desc(members.createdAt));
  return adminMemberListResponseSchema.parse({ members: rows.map(parseMemberRow) });
}

export async function getAdminMember(memberId: string) {
  if (useMemoryStore) {
    if (memberId !== SANDBOX_MEMBER_ID) throw new AdminOperatorError('ADMIN_API_NOT_FOUND', 404);
    const profile = await getParticipantProfile();
    return sandboxMember(profile.displayName);
  }
  const [row] = await db.select().from(members).where(eq(members.memberId, memberId)).limit(1);
  if (!row) throw new AdminOperatorError('ADMIN_API_NOT_FOUND', 404);
  return parseMemberRow(row);
}

export async function updateAdminMemberStatus(memberId: string, input: UpdateAdminMemberStatusRequest) {
  if (useMemoryStore) return adminMemberSchema.parse({ ...(await getAdminMember(memberId)), status: input.status, updatedAt: new Date().toISOString() });
  const [row] = await db.update(members).set({ status: input.status, updatedAt: new Date() }).where(eq(members.memberId, memberId)).returning();
  if (!row) throw new AdminOperatorError('ADMIN_API_NOT_FOUND', 404);
  return parseMemberRow(row);
}

export async function listAdminTournamentApplications() {
  if (useMemoryStore) {
    const myPage = await getMyPage();
    return adminTournamentApplicationListResponseSchema.parse({ applications: myPage.applications.map((application) => adminTournamentApplicationSchema.parse({ ...application, auditSafeMemberRef: auditRef(application.participantId) })) });
  }
  const rows = await db.select().from(tournamentApplications).orderBy(desc(tournamentApplications.submittedAt));
  return adminTournamentApplicationListResponseSchema.parse({ applications: rows.map((row) => adminTournamentApplicationSchema.parse({
    applicationId: row.applicationId, tournamentId: row.tournamentId, participantId: row.participantId, duprId: row.duprId, divisionId: row.divisionId ?? undefined,
    status: row.status, submittedAt: row.submittedAt.toISOString(), supportChannel: row.supportChannel, paymentStatus: row.paymentStatus, refundPolicy: row.refundPolicy, auditSafeMemberRef: auditRef(row.participantId),
  })) });
}

export async function getAdminTournamentApplication(applicationId: string) {
  const application = await getTournamentApplication(applicationId).catch(() => { throw new AdminOperatorError('ADMIN_API_NOT_FOUND', 404); });
  return adminTournamentApplicationSchema.parse({ ...application, auditSafeMemberRef: auditRef(application.participantId) });
}

export async function listAdminPaymentRecords() {
  if (useMemoryStore) {
    const myPage = await getMyPage();
    return adminPaymentRecordListResponseSchema.parse({ paymentRecords: myPage.paymentRecords.map((payment) => adminPaymentRecord(payment)) });
  }
  const rows = await db.select().from(paymentRecords).orderBy(desc(paymentRecords.recordedAt));
  return adminPaymentRecordListResponseSchema.parse({ paymentRecords: rows.map((row) => adminPaymentRecord({
    paymentRecordId: row.paymentRecordId, applicationId: row.applicationId, participantId: row.participantId, amountKrw: row.amountKrw, paymentMode: row.paymentMode,
    status: row.status, operatorNote: row.operatorNote ?? undefined, recordedAt: row.recordedAt.toISOString(),
  })) });
}

export async function listAdminRefundRecords() {
  const refunds = await getRefundService().listRefundsForAdmin();
  return adminPaymentRecordListResponseSchema.parse({
    paymentRecords: refunds.map(({ context, refundRequest }) => adminPaymentRecord({
      paymentRecordId: context.paymentRecordId,
      applicationId: context.applicationId,
      participantId: context.participantId,
      amountKrw: context.paidAmountKrw,
      paymentMode: context.paymentMode,
      status: refundRequest.paymentStatus,
      recordedAt: context.recordedAt,
    }, refundReviewStatus(refundRequest.status))),
  });
}

export async function updateAdminPaymentRecord(paymentRecordId: string, input: UpdateAdminPaymentStatusRequest) {
  if (useMemoryStore) {
    const existing = (await listAdminPaymentRecords()).paymentRecords.find((payment) => payment.paymentRecordId === paymentRecordId);
    if (!existing) throw new AdminOperatorError('ADMIN_API_NOT_FOUND', 404);
    return adminPaymentRecordSchema.parse({ ...existing, status: input.status, operatorNote: input.operatorNote ?? existing.operatorNote });
  }
  const [row] = await db.update(paymentRecords).set({ status: input.status, operatorNote: input.operatorNote, updatedAt: new Date() }).where(eq(paymentRecords.paymentRecordId, paymentRecordId)).returning();
  if (!row) throw new AdminOperatorError('ADMIN_API_NOT_FOUND', 404);
  return adminPaymentRecord({ paymentRecordId: row.paymentRecordId, applicationId: row.applicationId, participantId: row.participantId, amountKrw: row.amountKrw, paymentMode: row.paymentMode, status: row.status, operatorNote: row.operatorNote ?? undefined, recordedAt: row.recordedAt.toISOString() });
}

export async function listAdminSupportInquiries() {
  if (useMemoryStore) {
    const support = await getSupportCenter();
    return adminSupportInquiryListResponseSchema.parse({ inquiries: support.inquiries.map(adminSupportInquiry) });
  }
  const rows = await db.select().from(supportInquiries).orderBy(desc(supportInquiries.createdAt));
  return adminSupportInquiryListResponseSchema.parse({ inquiries: rows.map((row) => adminSupportInquiry({ inquiryId: row.inquiryId, participantId: row.participantId ?? undefined, applicationId: row.applicationId ?? undefined, channel: row.channel, category: row.category, subject: row.subject, status: row.status, createdAt: row.createdAt.toISOString() })) });
}

export async function updateAdminSupportInquiryStatus(inquiryId: string, input: UpdateAdminSupportInquiryStatusRequest) {
  if (useMemoryStore) {
    const existing = (await listAdminSupportInquiries()).inquiries.find((inquiry) => inquiry.inquiryId === inquiryId);
    if (!existing) throw new AdminOperatorError('ADMIN_API_NOT_FOUND', 404);
    return adminSupportInquirySchema.parse({ ...existing, status: input.status });
  }
  const [row] = await db.update(supportInquiries).set({ status: input.status, updatedAt: new Date() }).where(eq(supportInquiries.inquiryId, inquiryId)).returning();
  if (!row) throw new AdminOperatorError('ADMIN_API_NOT_FOUND', 404);
  return adminSupportInquiry({ inquiryId: row.inquiryId, participantId: row.participantId ?? undefined, applicationId: row.applicationId ?? undefined, channel: row.channel, category: row.category, subject: row.subject, status: row.status, createdAt: row.createdAt.toISOString() });
}

function sandboxMember(displayName: string) { return adminMemberSchema.parse({ memberId: SANDBOX_MEMBER_ID, email: 'operator-safe@example.invalid', displayName, status: 'active', createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' }); }
function auditRef(value: string) { return `audit:${Buffer.from(value).toString('base64url').slice(0, 12)}`; }
function adminPaymentRecord(payment: unknown, refundReviewStatus = 'notRequested') { return adminPaymentRecordSchema.parse({ ...(payment as object), refundReviewStatus }); }
function refundReviewStatus(status: RefundRequestStatus) {
  switch (status) {
    case 'operatorReview': return 'operatorReview';
    case 'approved': return 'approvedOffline';
    case 'rejected': return 'rejectedOffline';
    case 'providerPending': return 'providerPending';
    case 'providerFailed': return 'providerFailed';
    case 'refunded': return 'refunded';
  }
}
function adminSupportInquiry(inquiry: unknown) { const item = inquiry as { participantId?: string }; return adminSupportInquirySchema.parse({ ...(inquiry as object), auditSafeParticipantRef: item.participantId ? auditRef(item.participantId) : undefined }); }
function parseMemberRow(row: typeof members.$inferSelect) { return adminMemberSchema.parse({ memberId: row.memberId, email: row.email ?? undefined, phone: row.phone ?? undefined, displayName: row.displayName, status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }); }
