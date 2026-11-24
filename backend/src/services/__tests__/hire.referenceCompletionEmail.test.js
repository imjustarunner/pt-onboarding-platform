import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ send: vi.fn(), request: vi.fn(), complete: vi.fn(), receipt: vi.fn(), log: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async () => ({ first_name: 'Rory', last_name: 'QA', email: 'applicant@example.test' }) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 463, name: 'Juniper QA', people_ops_email: 'po@agency.test' }) } }));
vi.mock('../../models/HiringReferenceRequest.model.js', () => ({ default: { expireStaleRows: vi.fn(), findByPublicLinkToken: m.request, markCompleted: m.complete } }));
vi.mock('../emailTemplate.service.js', () => ({ default: { getTerminologySettings: () => 'People Operations' } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../hiringReferenceIdentity.service.js', () => ({ resolveHiringReferenceSenderIdentity: async () => ({ id: 51, agency_id: 463 }), resolveHiringReferenceReplyTo: async () => 'po@agency.test' }));
vi.mock('../hiringReferenceReceipt.service.js', () => ({ runReferenceReceiptNotifications: m.receipt }));
vi.mock('../hiringReferenceActivity.service.js', () => ({ appendEmailOpenPixel: html => html, buildReferenceOpenPixelUrl: () => '', logHiringReferenceEvent: m.log }));
import { submitPublicReferenceForm } from '../hiringReferenceRequests.service.js';
import { referenceQuestionnaire } from '../../utils/hiringReferenceQuestionnaire.js';
beforeEach(() => { vi.clearAllMocks();m.send.mockResolvedValue({ id: 'accepted' }); });
it('confirms completion to the applicant and thanks the referee without sending either the confidential answers', async () => {
  const row = { id: 47, agency_id: 463, candidate_user_id: 1849, reference_index: 1, reference_name: 'Taylor Reference', reference_email: 'referee@example.test', status: 'sent', token_expires_at: new Date(Date.now() + 86400000), questionnaire: referenceQuestionnaire };
  m.request.mockResolvedValue(row);m.complete.mockResolvedValue({ ...row, status: 'completed' });
  await submitPublicReferenceForm('a-valid-synthetic-token', { referenceName: 'Taylor Reference', relationshipType: 'manager', relationshipDuration: '3_5_years', strengths: 'CONFIDENTIAL STRENGTHS', developmentAreas: 'CONFIDENTIAL DEVELOPMENT', traits: Object.fromEntries(referenceQuestionnaire.traits.map(trait => [trait.key, 4])) });
  expect(m.send).toHaveBeenCalledTimes(2);
  const emails = m.send.mock.calls.map(([input]) => input);
  expect(emails.map(email => email.to)).toEqual(['referee@example.test', 'applicant@example.test']);
  for (const email of emails) {
    expect(email.replyToOverride).toBe('po@agency.test');
    expect(email.html).toContain('A People Operations Platform');expect(email.html).toContain('Want to use Plotline for your organization?');
    expect(email.html).toContain('href="mailto:po@agency.test"');expect(email.html).toContain('Contact People Operations');
    expect(email.text + email.html).not.toMatch(/CONFIDENTIAL STRENGTHS|CONFIDENTIAL DEVELOPMENT/);
  }
  expect(emails[0].html).toContain('identifying you by name');
  expect(emails[1].html).toContain('Taylor Reference');expect(emails[1].html).toContain('completion notice only');
  expect(m.receipt).toHaveBeenCalledWith({ agencyId: 463, sourceKind: 'online', sourceId: 47 });
});
