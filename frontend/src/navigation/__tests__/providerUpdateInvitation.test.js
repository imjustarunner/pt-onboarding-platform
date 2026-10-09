import {describe, expect, it} from 'vitest';
import {buildProviderUpdateInvitation} from '../providerUpdateInvitation.js';
describe('Provider Update invitation', () => {
  it('includes a personal link, the combined admin update, completion instructions and both help destinations', () => {
    const email = buildProviderUpdateInvitation({firstName:'Aunya',agencyName:'ITSCO',link:'https://app.itsco.health/provider-update/example'});
    expect(email.subject).toContain('Provider Update is ready');
    for(const body of [email.text, email.html]) {
      expect(body).toContain('Aunya');
      expect(body).toContain('https://app.itsco.health/provider-update/example');
      expect(body).toContain('Your Admin Update is included');
      expect(body).toContain('Mark each section complete');
      expect(body).toContain('People Operations');
      expect(body).toContain('this weekend');
      expect(body).toContain('do not hesitate');
      expect(body).toContain('reply to People Operations');
      expect(body).toContain('Technology');
      expect(body).not.toMatch(/junk|spam/i);
    }
    expect(email.html).toContain('Open my Provider Update →');
  });
  it('escapes recipient, agency and link attributes in HTML without changing the text alternative', () => {
    const email=buildProviderUpdateInvitation({firstName:'<Aunya>',agencyName:'A & B',link:'https://example.test/?a=1&b="x"'});
    expect(email.html).toContain('&lt;Aunya&gt;');
    expect(email.html).toContain('A &amp; B');
    expect(email.html).toContain('href="https://example.test/?a=1&amp;b=&quot;x&quot;"');
    expect(email.text).toContain('Hello <Aunya>');
  });
});
