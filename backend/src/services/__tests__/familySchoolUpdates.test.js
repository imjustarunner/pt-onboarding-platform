import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dobValuesMatch } from '../../utils/portalClientDob.js';
import { familyDocumentNotice, normalizeSessionItems } from '../familyDocumentSession.logic.js';
import { familyIntroductionLetter, portalProfilePath } from '../familyIntroduction.logic.js';
import { buildIntroductionPdf } from '../familyIntroductionPdf.js';

describe('family document session', () => {
  it('matches a stored birthday to the date the guardian enters', () => {
    assert.equal(dobValuesMatch('2014-03-02', '2014-03-02'), true);
    assert.equal(dobValuesMatch(new Date('2014-03-02T00:00:00Z'), '03/02/2014'), true);
    assert.equal(dobValuesMatch('2014-03-02', '2014-03-03'), false);
  });

  it('lets support combine documents and keeps providers on demographic confirmation', () => {
    assert.deepEqual(normalizeSessionItems([
      { clientId: 4, disclosure: true, roi: true, demographics: true },
      { clientId: 5, disclosure: true, roi: true }
    ]), [
      { clientId: 4, kinds: ['disclosure', 'roi', 'demographics'] },
      { clientId: 5, kinds: ['disclosure', 'roi'] }
    ]);
    assert.throws(() => normalizeSessionItems([{ clientId: 4, disclosure: true }], { providerOnly: true }), /demographic confirmation only/);
  });

  it('uses one sentence and one link for the family notice', () => {
    const notice = familyDocumentNotice({
      childNames: ['Ada', 'Bea'],
      link: 'https://app.example/family-documents/abc',
      signInUrl: 'https://app.example/login'
    });
    assert.match(notice.text, /Documents for your children need acknowledgement, review, or a signature/);
    assert.match(notice.sms, /https:\/\/app\.example\/family-documents\/abc/);
    assert.match(notice.html, /Sign in to AuricWell/);
  });
});

describe('family introduction', () => {
  it('describes the school day and leaves the reminder link off when reminders are on', () => {
    const letter = familyIntroductionLetter({
      providerName: 'Quinn Schoolswitch',
      schoolName: 'Cedar Grove',
      serviceDay: 'Tuesday',
      softTime: '09:00 AM',
      hasAccount: true,
      remindersOn: true,
      profileUrl: 'https://app.example/auricwell-qa-demo/provider/9',
      portalUrl: 'https://app.example/login'
    });
    assert.match(letter.text, /assigned to you or your dependent/);
    assert.match(letter.text, /Tuesday/);
    assert.match(letter.text, /09:00 AM/);
    assert.match(letter.text, /private space/);
    assert.match(letter.text, /40 minutes/);
    assert.match(letter.text, /60 minutes/);
    assert.match(letter.text, /typically weekly and sometimes monthly/);
    assert.match(letter.text, /Questions go to support/);
    assert.match(letter.text, /Sign in to AuricWell/);
    assert.match(letter.text, /Appointment reminders are on/);
    assert.doesNotMatch(letter.html, /Turn on texting reminders/);
    assert.match(letter.html, /Public profile/);
  });

  it('tells a new family to use email and birthdate and offers one reminder link', () => {
    const letter = familyIntroductionLetter({
      providerName: 'Quinn Schoolswitch',
      schoolName: 'Cedar Grove',
      serviceDay: 'Tuesday',
      hasAccount: false,
      remindersOn: false,
      reminderUrl: 'https://app.example/family-introduction/reminders/abc',
      portalUrl: 'https://app.example/login'
    });
    assert.match(letter.text, /email and your child's birthdate/);
    assert.match(letter.html, /Turn on texting reminders and provider reminders/);
  });

  it('tells the family the provider is copied on the support introduction', () => {
    const letter = familyIntroductionLetter({ providerName: 'Quinn Schoolswitch', schoolName: 'Cedar Grove', serviceDay: 'Tuesday', providerCopied: true });
    assert.match(letter.text, /Questions go to support\. Quinn Schoolswitch is copied on this email\./);
  });
});

describe('Family Welcome & Follow-Up templates', () => {
  it('puts the profile link in the recommended welcome email and accepts it as an optional field', async () => {
    const { DEFAULT_SCHOOL_CONTACT_TEMPLATE, PROFILE_LINK_TOKEN } = await import('../schoolContactTemplates.js');
    const { renderSchoolContactTemplate, validateSchoolContactTemplate } = await import('../schoolContactPlan.service.js');
    assert.ok(DEFAULT_SCHOOL_CONTACT_TEMPLATE.includes(PROFILE_LINK_TOKEN));
    const withoutLink = DEFAULT_SCHOOL_CONTACT_TEMPLATE.replace(`You can learn a little more about me here: ${PROFILE_LINK_TOKEN}\n\n`, '');
    assert.equal(validateSchoolContactTemplate(withoutLink), withoutLink);
    const text = renderSchoolContactTemplate(DEFAULT_SCHOOL_CONTACT_TEMPLATE, { parent_name: 'Pat', provider_name: 'Quinn', school_name: 'Cedar Grove', service_day: 'Tuesday', profile_link: 'https://app.example/demo/provider/9' });
    assert.match(text, /https:\/\/app\.example\/demo\/provider\/9/);
    assert.throws(() => validateSchoolContactTemplate(`${DEFAULT_SCHOOL_CONTACT_TEMPLATE} {{booking_link}}`), /supported/);
  });

  it('builds the public profile path and a SchoolCareBridge introduction PDF', async () => {
    assert.equal(portalProfilePath({ agencySlug: 'itsco', providerId: 9, providerName: 'Quinn Schoolswitch' }), 'https://www.itsco.health/providers/quinn-schoolswitch-9');
    assert.equal(portalProfilePath({ agencySlug: 'auricwell-qa-demo', providerId: 9, providerName: 'Quinn' }), '/auricwell-qa-demo/provider/9');
    const pdf = await buildIntroductionPdf({
      schoolName: 'Cedar Grove',
      staffNames: ['Jamie Admin'],
      providerName: 'Quinn Schoolswitch',
      blurb: 'A short introduction.',
      supervisorName: 'A Supervisor'
    });
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  });
});
