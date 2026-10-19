import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { deferSchoolGuardianInvitation } from '../../utils/schoolGuardianPortalPolicy.js';

// Run the actual packet email composer without sending mail or loading patient data.
const source = readFileSync(new URL('../publicIntake.controller.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('const resolvePacketCompletionEmailContent ='), source.indexOf('const resolveIntakeSenderIdentity ='));
const dependencies = {
  deferSchoolGuardianInvitation,
  EmailTemplate: { findById: vi.fn(), findByTypeAndAgency: vi.fn() },
  resolvePacketEmailTemplateType: () => null,
  renderTemplateString: (text, params) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? ''),
  stripEmptyTemporaryPasswordLines: text => text,
  escapeHtml: value => String(value || ''),
  toSimpleHtmlEmail: text => `<p>${text}</p>`
};
const compose = new Function(...Object.keys(dependencies), `${body}; return resolvePacketCompletionEmailContent;`)(...Object.values(dependencies));
const input = { signerName: 'Example Parent', signerEmail: 'parent@example.test', schoolName: 'Example School', agencyId: 2,
  clientCount: 1, downloadUrl: 'https://example.test/signed-packet', registrationNeedsSetup: true,
  registrationLoginEmail: 'parent@example.test', registrationTempPassword: 'secret-temporary-password',
  portalLoginUrl: 'https://example.test/login', registrationPasswordlessUrl: 'https://example.test/passwordless-login/secret' };
it.each([{scope_type:'school'}, {scope_type:'agency',is_school_master:1}, {inherits_school_master:'1'}])('sends school packet receipts without portal setup credentials for %j', async link => {
  const result = await compose({ ...input, link });
  expect(result.text).toContain(input.downloadUrl); expect(result.html).toContain(input.downloadUrl);
  expect(result.text).not.toContain('Guardian portal'); expect(result.html).not.toContain('Guardian portal');
  for (const secret of ['secret-temporary-password', '/passwordless-login/', 'https://example.test/login']) expect(JSON.stringify(result)).not.toContain(secret);
});
it('withholds credentials from custom school templates too', async () => {
  const result = await compose({ ...input, link: { scope_type:'school',custom_messages:{ completionEmailBody:'Receipt {{DOWNLOAD_URL}} {{REGISTRATION_TEMP_PASSWORD}} {{PORTAL_LOGIN_URL}} {{REGISTRATION_PASSWORDLESS_URL}}' } } });
  expect(result.text).toContain(input.downloadUrl); expect(JSON.stringify(result)).not.toContain('secret'); expect(result.text).not.toContain('/login');
});
it('preserves office enrollment setup instructions', async () => {
  const result = await compose({ ...input, link: {scope_type:'agency',inherits_office_master:1,is_school_master:0,inherits_school_master:'0'} });
  expect(result.text).toContain(input.registrationPasswordlessUrl); expect(result.html).toContain('Set up your guardian account');
});
