import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOtherGuardian,
  invitePublicUrl,
  toPublicInviteResult
} from '../coGuardianInvite.service.js';

test('shared legal rights is enough to invite the other guardian', () => {
  const person = normalizeOtherGuardian({
    firstName: 'Alex',
    lastName: 'Rivera',
    email: 'alex@example.com',
    legalAuthority: 'shared',
    sendInvite: true
  });
  assert.equal(person.hasLegalRights, true);
  assert.equal(person.email, 'alex@example.com');
});

test('invite URL lands on the isolated join page, not the first parent packet', () => {
  const url = invitePublicUrl({
    agency: { portal_url: 'itsco' },
    token: 'abc123'
  });
  assert.match(url, /\/join\/itsco\/counseling\/co-guardian\/abc123/);
  assert.equal(url.includes('/intake/'), false);
});

test('school invites reuse the school intake link with a co-guardian token', () => {
  const url = invitePublicUrl({
    agency: { portal_url: 'itsco' },
    token: 'abc123',
    publicKey: 'schoolkey'
  });
  assert.match(url, /\/intake\/schoolkey\?coGuardian=abc123/);
});

test('public invite payloads omit the raw token and any existing-account hints', () => {
  const publicResult = toPublicInviteResult({
    inviteId: 9,
    token: 'secret',
    inviteUrl: 'https://plottwisthq.com/join/itsco/counseling/co-guardian/secret',
    emailed: true,
    email: 'alex@example.com',
    existingAccount: true,
    matchedUserId: 88
  });
  assert.equal(publicResult.token, undefined);
  assert.equal(publicResult.existingAccount, undefined);
  assert.equal(publicResult.matchedUserId, undefined);
  assert.match(publicResult.inviteUrl, /co-guardian/);
});
