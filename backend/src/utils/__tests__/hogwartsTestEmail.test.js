import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOGWARTS_TEST_INBOX,
  extractEmailAddresses,
  isKeepRealHogwartsEmail,
  looksLikeHogwartsDemoAddress,
  looksLikeDemoFakeAddress,
  looksLikeTestInboxRedirectAddress,
  formatHogwartsTestSubject,
  rewriteHogwartsOutboundRecipient
} from '../hogwartsTestEmail.js';

describe('hogwartsTestEmail', () => {
  it('extracts emails from display-name headers', () => {
    assert.deepEqual(
      extractEmailAddresses('Sirius Black <order.sirius.black@itsco.health>'),
      ['order.sirius.black@itsco.health']
    );
  });

  it('does not treat Williams, Chuckie, or Piper as demo redirects', () => {
    assert.equal(isKeepRealHogwartsEmail('williams@itsco.health'), true);
    assert.equal(isKeepRealHogwartsEmail('chuckie@d11.org'), true);
    assert.equal(isKeepRealHogwartsEmail('piperf@itsco.health'), true);
    assert.equal(looksLikeHogwartsDemoAddress('williams@itsco.health'), false);
    assert.equal(looksLikeHogwartsDemoAddress('chuckie@d11.org'), false);
    assert.equal(looksLikeHogwartsDemoAddress('piperf@itsco.health'), false);
  });

  it('recognizes Hogwarts character and Order of the Phoenix aliases', () => {
    assert.equal(looksLikeHogwartsDemoAddress('sirius.black@hogwarts.edu'), true);
    assert.equal(looksLikeHogwartsDemoAddress('minerva.mcgonagall@hogwarts.edu'), true);
    assert.equal(looksLikeHogwartsDemoAddress('order.sirius.black@itsco.health'), true);
    assert.equal(looksLikeHogwartsDemoAddress('someone@itsco.health'), false);
    assert.equal(HOGWARTS_TEST_INBOX, 'testing@itsco.health');
  });

  it('recognizes playground fake provider domains and @example.com', () => {
    assert.equal(looksLikeDemoFakeAddress('provider.itsco-training@example.demo'), true);
    assert.equal(looksLikeDemoFakeAddress('dp1@demtest.com'), true);
    assert.equal(looksLikeDemoFakeAddress('parent@example.com'), true);
    assert.equal(looksLikeDemoFakeAddress('kid@example.org'), true);
    assert.equal(looksLikeDemoFakeAddress('applicant@mail.example.com'), true);
    assert.equal(looksLikeTestInboxRedirectAddress('provider.itsco-training@example.demo'), true);
    assert.equal(looksLikeTestInboxRedirectAddress('autofill@example.com'), true);
    assert.equal(looksLikeDemoFakeAddress('real.person@gmail.com'), false);
    assert.equal(looksLikeDemoFakeAddress('notexample.com@gmail.com'), false);
  });

  it('prefixes the original recipient on the subject', () => {
    assert.equal(
      formatHogwartsTestSubject('sirius.black@hogwarts.edu', 'Fall confirmation'),
      '[Hogwarts test → sirius.black@hogwarts.edu] Fall confirmation'
    );
    assert.equal(
      formatHogwartsTestSubject('a@hogwarts.edu', '[Hogwarts test → a@hogwarts.edu] Hi'),
      '[Hogwarts test → a@hogwarts.edu] Hi'
    );
    assert.equal(
      formatHogwartsTestSubject('provider.itsco-training@example.demo', 'Reset your password'),
      '[Demo test → provider.itsco-training@example.demo] Reset your password'
    );
    assert.equal(
      formatHogwartsTestSubject('parent@example.com', 'Packet complete'),
      '[Demo test → parent@example.com] Packet complete'
    );
  });

  it('rewrites demo fake addresses to the testing inbox', async () => {
    const result = await rewriteHogwartsOutboundRecipient({
      to: 'provider.itsco-training@example.demo',
      subject: 'Reset your password'
    });
    assert.equal(result.redirected, true);
    assert.equal(result.to, HOGWARTS_TEST_INBOX);
    assert.equal(result.originalTo, 'provider.itsco-training@example.demo');
    assert.match(result.subject, /Demo test → provider\.itsco-training@example\.demo/);
  });

  it('rewrites @example.com to the testing inbox', async () => {
    const result = await rewriteHogwartsOutboundRecipient({
      to: 'guardian@example.com',
      subject: 'Your intake packet'
    });
    assert.equal(result.redirected, true);
    assert.equal(result.to, HOGWARTS_TEST_INBOX);
    assert.equal(result.originalTo, 'guardian@example.com');
    assert.match(result.subject, /Demo test → guardian@example\.com/);
  });
});
