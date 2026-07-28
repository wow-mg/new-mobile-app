import { beforeEach, describe, expect, it } from 'vitest';
import { adminApiErrorResponseSchema, adminMemberListResponseSchema, adminPaymentRecordListResponseSchema, adminSupportInquiryListResponseSchema, adminTournamentApplicationListResponseSchema, tournamentApplicationSchema } from '@template/contracts';
import { app } from '../../app.js';
import { resetParticipantMvpState } from '../../services/participant-mvp.service.js';

const operatorHeaders = { authorization: 'Bearer operator-test', 'content-type': 'application/json' };
const participantHeaders = { authorization: 'Bearer test', 'content-type': 'application/json' };

async function requestJson(path: string, init?: RequestInit) {
  const res = await app.request(path, { ...init, headers: { ...operatorHeaders, ...init?.headers } });
  return { res, body: await res.json() };
}

describe('admin/operator dev-staging endpoints', () => {
  beforeEach(async () => { await resetParticipantMvpState(); });

  it('requires the operator bearer token and returns audit-safe errors', async () => {
    const missing = await app.request('/api/admin/members', { headers: { authorization: 'Bearer test' } });
    expect(missing.status).toBe(401);

    const notFound = await requestJson('/api/admin/members/missing-member');
    expect(notFound.res.status).toBe(404);
    expect(adminApiErrorResponseSchema.parse(notFound.body)).toEqual({ error: 'ADMIN_API_NOT_FOUND' });
    expect(JSON.stringify(notFound.body)).not.toContain('operator-test');
  });

  it('lists and updates members without exposing raw secrets', async () => {
    const members = await requestJson('/api/admin/members');
    expect(members.res.status).toBe(200);
    const parsed = adminMemberListResponseSchema.parse(members.body);
    expect(parsed.members[0]).toMatchObject({ memberId: 'member_sandbox_001', status: 'active' });

    const updated = await requestJson('/api/admin/members/member_sandbox_001/status', { method: 'PATCH', body: JSON.stringify({ status: 'suspended' }) });
    expect(updated.res.status).toBe(200);
    expect(updated.body).toMatchObject({ memberId: 'member_sandbox_001', status: 'suspended' });
  });

  it('exposes applications, payments/refunds, and support review packet shapes', async () => {
    await app.request('/api/participant/profile', { method: 'PATCH', headers: participantHeaders, body: JSON.stringify({ duprId: 'DUPR-12345' }) });
    const created = await app.request('/api/tournament-applications', { method: 'POST', headers: participantHeaders, body: JSON.stringify({ tournamentId: 'tournament_sandbox_001' }) });
    expect(tournamentApplicationSchema.parse(await created.json()).applicationId).toContain('tournament_sandbox_001');

    const applications = await requestJson('/api/admin/tournament-applications');
    expect(applications.res.status).toBe(200);
    expect(adminTournamentApplicationListResponseSchema.parse(applications.body).applications[0]?.auditSafeMemberRef).toMatch(/^audit:/);

    const payments = await requestJson('/api/admin/payments');
    expect(payments.res.status).toBe(200);
    expect(adminPaymentRecordListResponseSchema.parse(payments.body).paymentRecords[0]).toMatchObject({ refundReviewStatus: 'notRequested' });

    const refunds = await requestJson('/api/admin/refunds');
    expect(refunds.res.status).toBe(200);
    expect(adminPaymentRecordListResponseSchema.parse(refunds.body).paymentRecords).toEqual([]);

    const inquiries = await requestJson('/api/admin/support-inquiries');
    expect(inquiries.res.status).toBe(200);
    expect(adminSupportInquiryListResponseSchema.parse(inquiries.body).inquiries[0]?.auditSafeParticipantRef).toMatch(/^audit:/);
  });
});
