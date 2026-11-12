import { expect, it } from 'vitest';
import { secureMessageActionHtml } from '../secureMessageAction.service.js';
import { buildSecureMessageEmail } from '../clientPortalEmailContent.js';
import { buildBrandedMessageEmailHtml } from '../hubBrandedEmail.service.js';

const url = 'https://auricwell.com/secure-message/fictional-link?source=email&scope=qa';
it('uses the supplied image and the same authenticated link for the image and text fallback', () => {
  const html = secureMessageActionHtml(url);
  expect(html).toContain('/auricwell/session-comments/read-secure-message-button.png');
  expect(html).toContain('alt="Read secure message"');
  expect(html.match(/href="https:\/\/auricwell.com\/secure-message\/fictional-link\?source=email&amp;scope=qa"/g)).toHaveLength(2);
  expect(html).toContain('copy and paste');
});
it.each(['javascript:alert(1)', 'data:text/html,example', 'https://user:password@example.test/message', '/relative'])('does not make an unsafe button for %s', value => {
  expect(secureMessageActionHtml(value)).toBe('');
});
it('covers both family notices and the non-family secure-notification fallback', () => {
  const family = buildSecureMessageEmail({ agencyName: 'Fictional Agency', url });
  const staff = buildBrandedMessageEmailHtml({ agencyName: 'Fictional Agency', appUrl: url, secureMessageAction: true });
  for (const html of [family.html, staff]) {
    expect(html).toContain('data-secure-message-action="read"');
    expect(html).toContain('read-secure-message-button.png');
    expect(html).toContain('copy and paste');
  }
  expect(buildBrandedMessageEmailHtml({ appUrl: url })).toContain('Open in Messages');
});
