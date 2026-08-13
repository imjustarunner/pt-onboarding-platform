import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOGWARTS_TEST_INBOX,
  extractEmailAddresses,
  isKeepRealHogwartsEmail,
  looksLikeHogwartsDemoAddress,
  formatHogwartsTestSubject
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

  it('prefixes the original recipient on the subject', () => {
    assert.equal(
      formatHogwartsTestSubject('sirius.black@hogwarts.edu', 'Fall confirmation'),
      '[Hogwarts test → sirius.black@hogwarts.edu] Fall confirmation'
    );
    assert.equal(
      formatHogwartsTestSubject('a@hogwarts.edu', '[Hogwarts test → a@hogwarts.edu] Hi'),
      '[Hogwarts test → a@hogwarts.edu] Hi'
    );
  });
});
