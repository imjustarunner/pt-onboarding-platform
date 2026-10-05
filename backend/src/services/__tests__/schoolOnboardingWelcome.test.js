import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), agency: vi.fn(), identity: vi.fn(), group: vi.fn(), send: vi.fn(), portal: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: m.agency } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByAgencyAndIdentityKey: m.identity } }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: () => true, getGroup: m.group } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../emailSettings.service.js', () => ({ getEmailSendingMode: async () => 'all', isEmailNotificationsEnabled: async () => true }));
vi.mock('../schoolEmailPortal.service.js', () => ({ schoolEmailPortalUrl: m.portal }));
import { queueSchoolOnboardingWelcome, sendPendingSchoolOnboardingWelcomes } from '../schoolOnboardingWelcome.service.js';
import { schoolOnboardingWelcomeEmail } from '../../utils/schoolOnboardingWelcomeEmail.js';

const job = { id: 1, agency_id: 2, school_organization_id: 430, source_type: 'onboarding', source_id: 20 };
let jobs, groupEmail, completed, claimed;
beforeEach(() => {
  vi.resetAllMocks(); jobs = [{ ...job }]; groupEmail = 'keller@itsco.health'; completed = true; claimed = false;
  m.agency.mockImplementation(async id => id === 2 ? { name: 'ITSCO', slug: 'itsco' } : { name: 'Keller', organization_type: 'school', is_active: 1 });
  m.identity.mockResolvedValue({ id: 7, from_email: 'Technology@itsco.health' });
  m.group.mockResolvedValue({ id: 'group1' });
  m.portal.mockResolvedValue('https://app.itsco.health/keller/dashboard');
  m.send.mockResolvedValue({ id: 'sent1', communicationId: 99 });
  m.execute.mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT id,agency_id,school_organization_id FROM school_onboarding_welcome')) return [[]];
    if (sql.startsWith('SELECT * FROM school_onboarding_welcome')) return [jobs];
    if (sql.includes('SELECT itsco_email')) return [[{ itsco_email: groupEmail }]];
    if (sql.includes('SELECT i.id FROM school_onboarding') || sql.includes('SELECT id FROM school_reinit')) return [completed ? [{ id: 20 }] : []];
    if (sql.includes("SET delivery_status='sending'")) { const affectedRows = claimed ? 0 : 1; claimed = true; return [{ affectedRows }]; }
    return [{ affectedRows: 1 }];
  });
});

describe('school completion welcomes', () => {
  it('sends to the established school group, CCs Schools, and keeps Technology as sender and reply-to', async () => {
    await sendPendingSchoolOnboardingWelcomes();
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'keller@itsco.health', cc: 'schools@itsco.health', senderIdentityId: 7, replyToOverride: 'Technology@itsco.health', templateType: 'school_onboarding_welcome' }));
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('communication_id=?'), ['sent',99,'sent',null,1]);
  });
  it.each(['', 'someone@another-tenant.health'])('waits for an established ITSCO group (%s)', async value => {
    groupEmail = value; await sendPendingSchoolOnboardingWelcomes(); expect(m.send).not.toHaveBeenCalled();
  });
  it('waits if the group address is saved but not yet provisioned, then sends on a later tick', async () => {
    m.group.mockResolvedValueOnce(null); await sendPendingSchoolOnboardingWelcomes(); expect(m.send).not.toHaveBeenCalled();
    await sendPendingSchoolOnboardingWelcomes(); expect(m.send).toHaveBeenCalledTimes(1);
  });
  it('does not announce incomplete setup', async () => {
    completed = false; await sendPendingSchoolOnboardingWelcomes(); expect(m.send).not.toHaveBeenCalled();
  });
  it('supports finalized collaborative setup and remains one welcome per school', async () => {
    jobs[0].source_type = 'collaborative_update';
    await Promise.all([sendPendingSchoolOnboardingWelcomes(),sendPendingSchoolOnboardingWelcomes()]);
    expect(m.send).toHaveBeenCalledTimes(1);
    await queueSchoolOnboardingWelcome({ agencyId:2, schoolOrganizationId:430, sourceType:'collaborative_update',sourceId:64 });
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE id = school_onboarding_welcome_emails.id'), [2,430,'collaborative_update',64,2]);
  });
  it('never CCs ITSCO for another tenant', async () => {
    m.agency.mockResolvedValue({ slug:'other',name:'Other' });
    await sendPendingSchoolOnboardingWelcomes(); expect(m.send).not.toHaveBeenCalled();
  });
  it('holds an uncertain delivery instead of risking a duplicate email', async () => {
    m.send.mockRejectedValue(new Error('Connection closed after sending'));
    await sendPendingSchoolOnboardingWelcomes();
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('next_attempt_at=DATE_ADD'), ['held','Connection closed after sending',1]);
  });
  it('does not count a held or redirected message as sent', async () => {
    m.send.mockResolvedValue({ pendingApproval:true,communicationId:99,reason:'requires_approval' });
    expect(await sendPendingSchoolOnboardingWelcomes()).toEqual([{id:1,status:'held'}]);
  });
  it('escapes school data and explains school-only access without sharing credentials', () => {
    const draft = schoolOnboardingWelcomeEmail({schoolName:'<script>Keller</script>',agencyName:'ITSCO',groupEmail:'keller@itsco.health',portalUrl:'https://app.itsco.health/keller/dashboard',technologyEmail:'Technology@itsco.health'});
    expect(draft.html).not.toContain('<script>'); expect(draft.html).toContain('&lt;script&gt;');
    expect(draft.text).toContain('Digital Forms'); expect(draft.text).toContain('Printable Paperwork');
    expect(draft.text).toContain('School administrators'); expect(draft.text).toContain('not a shared portal login');
    expect(draft.text).toContain('permissions and the releases');
  });
});
