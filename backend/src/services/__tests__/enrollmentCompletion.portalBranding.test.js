import { expect, it, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), submission: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findById: m.submission } }));
import { enrollmentMailBrand, renderPortalEmail, portalSenderName } from '../portalEmailBranding.service.js';
import { requestingGuardianName } from '../coGuardianRequestOrigin.service.js';
const agency = { name: 'ITSCO', slug: 'itsco', feature_flags: { medicalBillingEnabled: true } };
it('leads with AuricWell and tags the agency with a real logo, paragraphs, and a button', () => {
 const brand = enrollmentMailBrand({ agency, domain: 'itsco.health' });
 const html = renderPortalEmail({ brand, text: 'Hi Sam,\n\nAlex requested this invitation.\n\nhttps://example.test/enroll\n\nUse your own account.', linkUrl: 'https://example.test/enroll', linkLabel: 'Complete your enrollment' });
 expect(brand.displayName).toBe('AuricWell Portal');
 expect(html).toContain('aria-label="AuricWell Portal"');
 expect(html).toContain('width="32"');
 expect(html).not.toContain('YOUR CARE AGENCY');
 expect(html).not.toContain('max-height:56px');
 expect(html).toContain('itsco-logo.png');
 expect(html).toContain('auricwell/logo.png');
 expect(html).toContain('>Complete your enrollment</a>');
 expect(html).not.toContain('>https://example.test/enroll');
 expect(html).toContain('margin:0 0 18px');
 expect(renderPortalEmail({ brand, html })).toBe(html);
 expect(portalSenderName({ identity_key: 'clinical_enrollment_portal', display_name: 'ITSCO Portal' })).toBe('AuricWell Portal');
});
it('keeps tutoring branded to the agency, even when it also offers healthcare', () => {
 const brand = enrollmentMailBrand({ agency: { ...agency, name: 'Next Level Up', slug: 'nlu' }, domain: 'nextleveluplcc.com', channel: 'tutoring' });
 const html = renderPortalEmail({ brand, text: 'Welcome to tutoring.' });
 expect(html).toContain('Next Level Up Portal');
 expect(html).not.toContain('AuricWell');
 expect(html).not.toContain('clinical');
});
it('escapes names and rejects unsafe asset and action URLs', () => {
 const brand = enrollmentMailBrand({ agency: { name: '<script>bad</script>', logo_url: 'javascript:bad' }, domain: 'example.test', channel: 'tutoring' });
 const html = renderPortalEmail({ brand, text: '<b>Hi</b>\n\njavascript:bad', linkUrl: 'javascript:bad' });
 expect(html).not.toContain('<script>');
 expect(html).not.toContain('src="javascript:');
 expect(html).not.toContain('href="javascript:');
 expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
});
beforeEach(() => { vi.clearAllMocks(); m.execute.mockResolvedValue([[{ role: 'client_guardian', access_enabled: 1, first_name: 'Alex', last_name: 'Parent' }]]); });
it('attributes an authenticated guardian only within the invite agency and dependent', async () => {
 expect(await requestingGuardianName({ inviteId: 18, agencyId: 2, clientId: 20 })).toBe('Alex Parent');
 expect(m.execute.mock.calls[0][1]).toEqual([20, 18, 2]);
 expect(m.execute.mock.calls[0][0]).toContain('c.agency_id=i.agency_id');
});
it('never labels the staff member who resends an invitation as a guardian', async () => {
 m.execute.mockResolvedValue([[{ role: 'super_admin', first_name: 'Staff', last_name: 'Member' }]]);
 expect(await requestingGuardianName({ inviteId: 18, agencyId: 2, clientId: 20 })).toBeNull();
});
it('retains the originating guardian from a completed enrollment when staff resend', async () => {
 m.execute.mockResolvedValue([[{ role: 'super_admin', requesting_submission_id: 80 }]]);
 m.submission.mockResolvedValue({ client_id: 20, status: 'submitted', submitted_at: '2026-10-01', intake_data: { guardian: { firstName: 'Alex', lastName: 'Parent', other_guardian_has_legal_rights: 'shared' } } });
 expect(await requestingGuardianName({ inviteId: 18, agencyId: 2, clientId: 20 })).toBe('Alex Parent');
});
it.each([{ client_id: 99 }, { status: 'draft' }, { co_guardian_invite_id: 7 }])('rejects unrelated or uncompleted request records %j', async extra => {
 m.execute.mockResolvedValue([[{ requesting_submission_id: 80 }]]);
 m.submission.mockResolvedValue({ client_id: 20, status: 'submitted', submitted_at: '2026-10-01', intake_data: { guardian: { firstName: 'Wrong', other_guardian_has_legal_rights: 'yes' } }, ...extra });
 expect(await requestingGuardianName({ inviteId: 18, agencyId: 2, clientId: 20 })).toBeNull();
});

it('keeps clinical reminders separate from nonclinical agency mail',()=>{
 expect(portalSenderName({identity_key:'clinical_appointment_reminders'})).toBe('AuricWell Reminders');
 const brand=enrollmentMailBrand({agency,domain:'itsco.health'});
 const html=renderPortalEmail({brand:{...brand,displayName:'AuricWell Reminders'},text:'Your upcoming appointment.'});
 expect(html).toContain('AuricWell Reminders');
 expect(html).toContain('REMINDERS');
});
