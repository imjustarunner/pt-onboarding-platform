import { expect, it, vi } from 'vitest';
vi.mock('../contactReminderToken.service.js', () => ({ publicAppBaseUrl: () => 'https://portal.example.com' }));
vi.mock('../tenantEmailChrome.service.js', () => ({ applyTenantEmailChromeHtml: html => html, resolveTenantEmailChrome: vi.fn() }));
import { buildPortalInvitationEmail } from '../portalInvitationEmail.service.js';
it('uses sign-in copy for existing accounts and identifies notification setup in both formats', () => {
  const result = buildPortalInvitationEmail({ existingAccount: true, agencyName: 'Care & Family', setupUrl: 'https://portal.example.com/login' });
  expect(result.html).toContain('Open Your Portal'); expect(result.html).toContain('Care &amp; Family');
  expect(result.text).toContain('sign in to your account');
  for (const body of [result.html, result.text]) expect(body).toContain('Your first task: review your notification preferences');
});
it('keeps setup links for new accounts', () => {
  const result = buildPortalInvitationEmail({ setupUrl: 'https://portal.example.com/new_account/token' });
  expect(result.html).toContain('Create Your Portal Account'); expect(result.text).toContain('/new_account/token');
});
