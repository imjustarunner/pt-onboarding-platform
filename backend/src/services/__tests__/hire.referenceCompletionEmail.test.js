import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ send: vi.fn(), request: vi.fn(), complete: vi.fn(), decline: vi.fn(), receipt: vi.fn(), log: vi.fn(), queue:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async () => ({ first_name: 'Rory', last_name: 'QA', email: 'applicant@example.test' }) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 463, name: 'Juniper QA', people_ops_email: 'po@agency.test' }) } }));
vi.mock('../../models/HiringReferenceRequest.model.js', () => ({ default: { expireStaleRows: vi.fn(), findByPublicLinkToken: m.request, markCompleted: m.complete, markDeclined: m.decline } }));
vi.mock('../emailTemplate.service.js', () => ({ default: { getTerminologySettings: () => 'People Operations' } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../hiringReferenceIdentity.service.js', () => ({ resolveHiringReferenceSenderIdentity: async () => ({ id: 51, agency_id: 463 }), resolveHiringReferenceReplyTo: async () => 'po@agency.test' }));
vi.mock('../hiringReferenceReceipt.service.js', () => ({ runReferenceReceiptNotifications: m.receipt }));
vi.mock('../hiringReferenceActivity.service.js', () => ({ appendEmailOpenPixel: html => html, buildReferenceOpenPixelUrl: () => '', logHiringReferenceEvent: m.log }));
vi.mock('../hiringJourneyEvents.service.js',()=>({queueReferenceHiringText:m.queue}));
import { submitPublicReferenceForm } from '../hiringReferenceRequests.service.js';
import { referenceQuestionnaire } from '../../utils/hiringReferenceQuestionnaire.js';
beforeEach(() => { vi.clearAllMocks();m.send.mockResolvedValue({ id: 'accepted' });m.decline.mockResolvedValue(true);m.receipt.mockResolvedValue(); });
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
  expect(m.queue).toHaveBeenCalledWith({agencyId:463,userId:1849,referenceIndex:1,method:'online',completed:true});
  expect(JSON.stringify(m.queue.mock.calls)).not.toMatch(/CONFIDENTIAL|Taylor Reference/);
});

it('dispatches a decline to hiring staff without telling the applicant a reference was completed or sending thank-you mail', async () => {
  m.request.mockResolvedValue({id:47,agency_id:463,candidate_user_id:1849,reference_index:1,status:'sent',token_expires_at:new Date(Date.now()+86400000)});
  expect(await submitPublicReferenceForm('synthetic-token',{declined:true,strengths:'DISCARDED ANSWERS'})).toEqual({ok:true,declined:true});
  expect(m.queue).not.toHaveBeenCalled();expect(m.decline).toHaveBeenCalledWith(47);expect(m.complete).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
  expect(m.receipt).toHaveBeenCalledWith({agencyId:463,sourceKind:'online',sourceId:47});
  expect(JSON.stringify(m.log.mock.calls)).not.toContain('DISCARDED ANSWERS');
});

it('does not acknowledge a decline or dispatch an alert if its transaction lost the race', async () => {
  m.request.mockResolvedValue({id:47,status:'sent',token_expires_at:new Date(Date.now()+86400000)});m.decline.mockResolvedValue(false);
  await expect(submitPublicReferenceForm('synthetic-token',{declined:true})).rejects.toHaveProperty('status',409);
  expect(m.receipt).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});

it('keeps a committed decline successful when prompt delivery fails, leaving the durable worker to deliver it', async () => {
  m.request.mockResolvedValue({id:47,agency_id:463,candidate_user_id:1849,reference_index:1,status:'sent',token_expires_at:new Date(Date.now()+86400000)});
  m.receipt.mockRejectedValueOnce(Object.assign(new Error('Worker unavailable'),{code:'TEST_WORKER_UNAVAILABLE'}));
  const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try { expect(await submitPublicReferenceForm('synthetic-token',{declined:true})).toEqual({ok:true,declined:true});expect(m.decline).toHaveBeenCalledOnce(); }
  finally { warning.mockRestore(); }
});
