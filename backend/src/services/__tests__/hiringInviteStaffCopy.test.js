import { expect, it } from 'vitest';
import { hiringInviteStaffCopy, storedHiringInviteMessage } from '../hiringInviteStaffCopy.js';

it('copies a saved branded invite and note without its sign-in credential or original open tracker', () => {
  const token = 'legacy-private-signing-token';
  const url = `https://app.itsco.health/pre-hire/${token}?from=email&amp;entry=1`;
  const original = {
    subject: 'Your offer',
    body: `<div style="font-family:Arial"><p>Welcome to the team.</p><ol><li>Fingerprinting</li></ol><p>A note from People Operations</p><a href="${url}">Open portal</a><p>${token}</p><img src="https://app.itsco.health/api/email/track-open/original.gif" /></div>`
  };
  const copy = hiringInviteStaffCopy(storedHiringInviteMessage(original), {});
  expect(copy.subject).toBe('Staff copy — Your offer');
  expect(copy.html).toContain('font-family:Arial');
  expect(copy.html).toContain('<li>Fingerprinting</li>');
  expect(copy.html).toContain('A note from People Operations');
  expect(copy.html).toContain('href="#private-candidate-link">Open portal');
  expect(copy.html).not.toContain(token);
  expect(copy.html).not.toContain('/track-open/');
  expect(hiringInviteStaffCopy(copy, {}).html).toBe(copy.html);
});

it('keeps the complete text email while removing candidate credentials', () => {
  const copy = hiringInviteStaffCopy({ subject: 'Onboarding', text: 'Welcome.\nhttps://plotlinepo.com/pre-hire/abcd17\nPlease review your checklist.' }, {});
  expect(copy.text).toContain('Welcome.\n[private link]\nPlease review your checklist.');
  expect(copy.text).not.toContain('abcd17');
});
