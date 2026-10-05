import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SmsConsentForm from '../SmsConsentForm.vue';
const disclosure = { version: 'test-1', brandName: 'ITSCO', legalName: 'ITSCO, LLC', supportContact: 'support@itsco.health',
  text: 'Message frequency varies. Message and data rates may apply. Reply STOP to opt out. HELP for help.',
  signatureText: 'I electronically sign my choices.', termsUrl: 'https://example.org/terms', privacyUrl: 'https://example.org/privacy',
  purposes: [{ purpose: 'reminders', label: 'Appointment reminders' }, { purpose: 'marketing', label: 'Optional marketing' }] };
describe('SMS consent form and reviewer example', () => {
  it('never preselects consent and exposes the same disclosures and policy links', () => {
    const wrapper = mount(SmsConsentForm, { props: { disclosure } });
    expect(wrapper.findAll('input[type=checkbox], input[type=radio]').every((input) => !input.element.checked)).toBe(true);
    expect(wrapper.findAll('input[type=radio]').every(input => input.attributes('required') !== undefined)).toBe(true);
    expect(wrapper.text()).toContain('not a condition of care or purchase');
    expect(wrapper.findAll('a').map((a) => a.attributes('href'))).toEqual([disclosure.termsUrl, disclosure.privacyUrl]);
  });
  it('records independent choices, signer and explicit electronic-signature authority', async () => {
    const wrapper = mount(SmsConsentForm, { props: { disclosure, disclosureHash: 'version-hash' } });
    await wrapper.get('input[name=sms-reminders][value=yes]').setValue(true);
    await wrapper.get('input[name=sms-marketing][value=no]').setValue(true);
    await wrapper.get('input[type=tel]').setValue('3035550101');
    await wrapper.get('input[autocomplete=name]').setValue('Sample Guardian');
    const checkboxes = wrapper.findAll('input[type=checkbox]');
    await checkboxes[0].setValue(true); await checkboxes[1].setValue(true);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('sign')[0][0]).toEqual({ choices: { reminders: 'yes', marketing: 'no' }, phone: '3035550101',
      signerName: 'Sample Guardian', authorityAccepted: true, electronicSignatureAccepted: true, disclosureHash: 'version-hash' });
  });
  it('blocks unanswered and partially answered choices', async () => {
    const wrapper = mount(SmsConsentForm, { props: { disclosure } });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('sign')).toBeUndefined();
    expect(wrapper.get('[role=alert]').text()).toContain('Choose Yes or No');
    await wrapper.get('input[name=sms-reminders][value=yes]').setValue(true);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('sign')).toBeUndefined();
  });
  it('allows an explicit No for every message type', async () => {
    const wrapper = mount(SmsConsentForm, { props: { disclosure } });
    for (const input of wrapper.findAll('input[type=radio][value=no]')) await input.setValue(true);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('sign')[0][0].choices).toEqual({ reminders: 'no', marketing: 'no' });
  });
  it('cannot enroll anyone from the public example', async () => {
    const wrapper = mount(SmsConsentForm, { props: { disclosure, example: true } });
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('sign')).toBeUndefined();
  });
});
