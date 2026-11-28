import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ configuration: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
vi.mock('../applicantAdminNotices.service.js', () => ({ applicantAdminConfiguration: m.configuration }));
import { hiringMilestoneContent, hiringMilestoneConfiguration, createHiringMilestoneWorker,
 assertHiringMilestoneNotice, discoverHiringMilestones, hiringMilestoneSource } from '../hiringMilestoneNotices.service.js';
const row = { agency_id: 463, candidate_user_id: 42, task_id: 123, name: 'Juniper Consulting QA',
 slug: 'juniper-qa', first_name: 'Taylor', last_name: 'Example', signed_at: '2026-11-28 01:00:00', prehire_completed_at: null };
const config = { identity: { id: 9, from_email: 'po@tenant.test' }, to: 'admin@tenant.test', replyTo: 'po@tenant.test' };
beforeEach(() => { vi.clearAllMocks(); m.configuration.mockResolvedValue(config); });
it('celebrates the signature without claiming unfinished pre-hire is complete', () => {
 const content = hiringMilestoneContent(row, 'offer_signed');
 expect(content.subject).toBe('Offer signed — Taylor Example');
 expect(content.text).toContain('remaining pre-hire requirements');
 expect(content.html).toContain('A People Operations Platform');
 expect(content.html).toContain('Juniper Consulting QA');
 expect(content.html).toContain('/admin/hiring/people/42/packages');
 expect(content.html).toContain('Review candidate');
 expect(content.html).not.toContain('Want to use Plotline');
});
it('announces signed contract and completed pre-hire for the completion milestone', () => {
 expect(hiringMilestoneContent({ ...row, prehire_completed_at: '2026-11-28' }, 'prehire_complete').text)
  .toContain('signed their employment contract and completed pre-hire');
 expect(hiringMilestoneContent({ ...row, first_name: '<img onerror=x>' }, 'offer_signed').html).not.toContain('<img onerror=x>');
});
it('uses the verified company PO and admin mailboxes independently', async () => {
 expect((await hiringMilestoneConfiguration(row, 'people_operations')).to).toBe('po@tenant.test');
 expect((await hiringMilestoneConfiguration(row, 'admin')).to).toBe('admin@tenant.test');
 await expect(hiringMilestoneConfiguration(row, 'external')).rejects.toMatchObject({ status: 403 });
 m.configuration.mockRejectedValue(new Error('Sender not verified'));
 await expect(hiringMilestoneConfiguration(row, 'admin')).rejects.toThrow('not verified');
});
it('scans only new signed offers and completed journeys with durable unique department keys', async () => {
 const db = { execute: vi.fn(async () => []) };
 await discoverHiringMilestones(db);
 expect(db.execute).toHaveBeenCalledTimes(4);
 for (const [sql, args] of db.execute.mock.calls) {
  expect(sql).toContain('hiring_milestone_rollout');
  expect(sql).toContain('s.user_id=u.id');
  expect(sql).toContain('g.agency_id=a.id');
  expect(sql).toContain("$.employmentContract");
  expect(sql.match(/\?/g)).toHaveLength(args.length);
 }
});
it('rejects completion when the canonical journey is still incomplete', async () => {
 const db = { execute: vi.fn(async () => [[row]]) };
 expect(await hiringMilestoneSource({ agency_id: 463, candidate_user_id: 42, task_id: 123, event_type: 'prehire_complete', event_key: 'prehire:42:2026-11-28' }, db)).toBeNull();
 expect(db.execute.mock.calls[0][1]).toEqual([463, 42, 123, 'prehire:42:2026-11-28']);
});
function fixture() {
 const event = { id: 1, agency_id: 463, candidate_user_id: 42, task_id: 123, event_type: 'offer_signed', event_key: 'offer:123', department: 'admin', status: 'pending' };
 const record = { id: 50, agency_id: 463, template_type: 'hiring_milestone_group', channel: 'email',
  recipient_address: config.to, generated_by_user_id: 42, metadata: { hiringMilestoneNoticeId: 1 } };
 const execute = vi.fn(async (sql, args) => {
  if (sql.startsWith("SELECT * FROM hiring_milestone")) return [[event]];
  if (sql.startsWith('SELECT * FROM user_communications')) return [[record]];
  if (sql.includes("SET status='sending'")) { const pending = event.status === 'pending'; event.status = 'sending'; return [{ affectedRows: pending ? 1 : 0 }]; }
  if (sql.includes('SET status=?,review_reason')) event.status = args[0];
  return [[]];
 });
 return { event, record, d: { db: { execute }, discover: vi.fn(), source: vi.fn(async () => row),
  configuration: vi.fn(async () => config), communication: vi.fn(async () => record),
  updateCommunication: vi.fn(), send: vi.fn(async () => ({ id: 'transport-id' })) } };
}
it('claims a milestone once across concurrent/repeated worker runs', async () => {
 const { d } = fixture();
 const work = createHiringMilestoneWorker(d);
 await Promise.all([work(), work()]);
 expect(d.send).toHaveBeenCalledTimes(1);
 expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@tenant.test', agencyId: 463, existingCommunicationId: 50, html: expect.stringContaining('Plotline') }));
});
it.each([{ pendingApproval: true }, { skipped: true }, {}])('retains uncertain or held sends for review without retry %j', async result => {
 const { d, event } = fixture(); d.send.mockResolvedValue(result);
 await createHiringMilestoneWorker(d)();
 expect(event.status).toBe(result.pendingApproval ? 'pending_approval' : result.skipped ? 'skipped' : 'held');
});
it('holds missing configuration and never calls transport', async () => {
 const { d, event } = fixture(); d.configuration.mockRejectedValue(new Error('Missing admin group'));
 await createHiringMilestoneWorker(d)();
 expect(event.status).toBe('held'); expect(d.send).not.toHaveBeenCalled();
});
it('revalidates mailboxes and company at the sender boundary including manual approval', async () => {
 const { d, event, record } = fixture();
 Object.assign(event, { status: 'pending_approval', sender_identity_id: 9, recipient_address: config.to });
 const input = { templateType: record.template_type, existingCommunicationId: 50, agencyId: 463, senderIdentityId: 9, to: config.to };
 await expect(assertHiringMilestoneNotice(input, d)).resolves.toBeUndefined();
 await expect(assertHiringMilestoneNotice({ ...input, agencyId: 464 }, d)).rejects.toMatchObject({ status: 403 });
 await expect(assertHiringMilestoneNotice({ ...input, to: 'other@tenant.test' }, d)).rejects.toMatchObject({ status: 403 });
 await expect(assertHiringMilestoneNotice({ ...input, bcc: ['hidden@tenant.test'] }, d)).rejects.toMatchObject({ status: 403 });
 d.source.mockResolvedValue(null);
 await expect(assertHiringMilestoneNotice(input, d)).rejects.toMatchObject({ status: 403 });
});

it('recognizes a proved QA redirect for a saved Plotline QA company', async () => {
 const { d, event } = fixture();
 d.source.mockResolvedValue({ ...row, plotline_is_qa: 1 });
 d.send.mockResolvedValue({ id: 'qa-transport', redirected: true,
  testInboxRedirect: { agencyId: 463, deliveredTo: ['testing@itsco.health'] } });
 await createHiringMilestoneWorker(d)();
 expect(event.status).toBe('sent');
});
