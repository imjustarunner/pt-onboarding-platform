import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ExchangeParameterSummary from '../ExchangeParameterSummary.vue';

const providers = [
  { userId: 1, name: 'Eden Example', matched: false, canRequest: true, checks: [
    { field: 'insurance', status: 'pass', reason: 'Current payer accepted.' },
    { field: 'schedule', status: 'fail', reason: 'Client requests Monday/Friday mornings; provider has Friday afternoons and weekends.' },
    { field: 'provider_gender', applicable: false, status: 'unknown', reason: 'Not specified.' }
  ] },
  { userId: 2, name: 'Kate Example', matched: false, canRequest: false, checks: [
    { field: 'insurance_credential', status: 'unknown', reason: 'An effective date has not been recorded.' },
    { field: 'schedule', status: 'pass', reason: 'Availability overlaps.' }
  ] }
];
it('explains why aggregate pass counts do not establish a provider match', () => {
  const wrapper = mount(ExchangeParameterSummary, { props: { providers } });
  expect(wrapper.text()).toContain('passing several rows does not mean the same provider meets every requirement');
  expect(wrapper.find('.provider-result').exists()).toBe(false);
  wrapper.unmount();
});
it('shows only the selected provider’s actual applicable differences', async () => {
  const wrapper = mount(ExchangeParameterSummary, { props: { providers } });
  await wrapper.get('select').setValue('1');
  const result = wrapper.get('.provider-result').text();
  expect(result).toContain('Eden Example · Can request with review');
  expect(result).toContain('Days and times:');
  expect(result).toContain('Monday/Friday mornings');
  expect(result).not.toContain('Current payer accepted');
  expect(result).not.toContain('Not specified');
  expect(result).not.toContain('effective date');
  wrapper.unmount();
});
it('distinguishes a blocked insurance review from a schedule difference', async () => {
  const wrapper = mount(ExchangeParameterSummary, { props: { providers } });
  await wrapper.get('select').setValue('2');
  expect(wrapper.get('.provider-result').text()).toContain('Kate Example · Request blocked');
  expect(wrapper.get('.provider-result').text()).toContain('Insurance credentials: An effective date has not been recorded.');
  expect(wrapper.get('.provider-result').text()).not.toContain('Monday/Friday');
  wrapper.unmount();
});
it('clears stale differences if the selected provider disappears on refresh', async () => {
  const wrapper = mount(ExchangeParameterSummary, { props: { providers } });
  await wrapper.get('select').setValue('2');
  await wrapper.setProps({ providers: [providers[0]] });
  expect(wrapper.find('.provider-result').exists()).toBe(false);
  expect(wrapper.text()).not.toContain('Kate Example');
  wrapper.unmount();
});
