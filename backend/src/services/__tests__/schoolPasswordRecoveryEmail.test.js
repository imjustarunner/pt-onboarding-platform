import { afterEach, expect, it, vi } from 'vitest';
import { schoolPasswordRecoveryEmail } from '../schoolPasswordRecoveryEmail.service.js';
import { renderPortalEmail } from '../portalEmailBranding.service.js';
import { compactSchoolCareBridgeEmail } from '../schoolCareBridgeEmail.service.js';

const input = {user:{first_name:'Jamie'},organization:{id:451,slug:'cedar-grove',name:'Cedar Grove K–8',organization_type:'school'},token:'test-token',loginEmail:'jamie@example.test',firstSet:false,expiresInHours:48};
afterEach(() => vi.unstubAllEnvs());
it('renders a school-branded frame with exactly one reset action and one school portal link', () => {
  const mail = schoolPasswordRecoveryEmail(input);
  const compact = compactSchoolCareBridgeEmail({text:mail.body,html:mail.html,templateType:'password_reset',schoolCommunication:true});
  const html = renderPortalEmail({brand:{...mail.portalEmailBrand,replyTo:'technology@itsco.health'},...compact});
  expect(html).toContain('aria-label="SchoolCareBridge"');
  expect(html).toContain('Cedar Grove K–8');
  expect(html.match(/href="[^"]+reset-password\/[^"]+"/g)).toHaveLength(1);
  expect(html).not.toContain('plottwisthq.com'); expect(html).not.toContain('app.itsco.health');
  expect(html).not.toContain('Donate');
});
it('escapes recipient and school names in the HTML', () => {
  const mail = schoolPasswordRecoveryEmail({...input,user:{first_name:'<script>bad</script>'},organization:{...input.organization,name:'School <test>'}});
  expect(mail.html).not.toContain('<script>'); expect(mail.html).toContain('School &lt;test&gt;');
});
it('uses the configured SchoolCareBridge deployment consistently', () => {
  vi.stubEnv('SCHOOLCAREBRIDGE_PUBLIC_ORIGIN','https://mh4kidz.org');
  const mail = schoolPasswordRecoveryEmail(input);
  expect(mail.resetLink).toBe('https://mh4kidz.org/schoolcarebridge/app/cedar-grove/reset-password/test-token');
  expect(mail.html).toContain('href="https://mh4kidz.org/schoolcarebridge/app/cedar-grove"');
});
it('returns agency identities to school selection without pretending their agency is a school', () => {
  const mail = schoolPasswordRecoveryEmail({...input,organization:{id:450,slug:'itsco',name:'ITSCO',organization_type:'agency'}});
  expect(mail.resetLink).toContain('/app/itsco/reset-password/');
  expect(mail.html).toContain('href="https://schoolcarebridge.org/app"');
  expect(mail.schoolOrganizationId).toBeNull();
});
it.each(['','//elsewhere.test','school/../../login'])('rejects unconfigured or invalid account portal slugs: %s', slug => {
  expect(() => schoolPasswordRecoveryEmail({...input,organization:{...input.organization,slug}})).toThrow();
});
