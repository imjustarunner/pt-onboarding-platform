import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isExternalTestingEmail, isExternalTestingMailHeaders, isExternalTestingHistory, appCommunicationVisibilitySql } from '../externalTestingEmail.js';

describe('external testing mail stays outside the app', () => {
  it('recognizes testing addresses and tagged aliases across envelope formats', () => {
    for (const address of ['testing@itsco.health', 'TESTING@ITSCO.HEALTH', 'QA <testing@itsco.health>',
      'Tester <testing+schoolstaff1101@itsco.health>', 'normal@example.org, testing@itsco.health']) {
      assert.equal(isExternalTestingEmail(address), true, address);
    }
    assert.equal(isExternalTestingEmail([{ email: 'normal@example.org' }, { email: 'testing@itsco.health' }]), true);
  });
  it('keeps similarly named accounts and quoted body mentions in ordinary mail', () => {
    for (const address of ['mytesting@itsco.health', 'testing-team@itsco.health', 'normal@testing.example.org', '', null]) {
      assert.equal(isExternalTestingEmail(address), false, String(address));
    }
    assert.equal(isExternalTestingMailHeaders(new Map([['from','normal@example.org'], ['to','support@itsco.health'], ['subject','About testing@itsco.health']])), false);
  });
  it('detects direct, copied, blind-copied, and rewritten group deliveries', () => {
    for (const header of ['from','to','cc','bcc','reply-to','sender','delivered-to','x-original-to','envelope-to','x-original-sender','x-google-original-from']) {
      assert.equal(isExternalTestingMailHeaders(new Map([[header, 'testing@itsco.health']])), true, header);
    }
  });
  it('hides redirected email receipts but keeps SMS and unrelated operational notices', () => {
    assert.equal(isExternalTestingHistory({channel:'email',recipient_address:'testing@itsco.health'}), true);
    assert.equal(isExternalTestingHistory({channel:'email',recipient_address:'qa.family@example.com',metadata:JSON.stringify({deliveredTo:'testing@itsco.health'})}), true);
    assert.equal(isExternalTestingHistory({channel:'sms',recipient_address:'testing@itsco.health'}), false);
    assert.equal(isExternalTestingHistory({channel:'email',recipient_address:'real@example.org',metadata:{opsNotifiedTo:'testing@itsco.health'}}), false);
    assert.equal(isExternalTestingHistory({channel:'email',recipient_address:'real@example.org',metadata:'invalid'}), false);
  });
  it('rejects interpolated SQL identifiers', () => {
    assert.throws(() => appCommunicationVisibilitySql('uc; DELETE'), /Invalid SQL alias/);
    assert.match(appCommunicationVisibilitySql('uc'), /uc\.recipient_address/);
  });
});
