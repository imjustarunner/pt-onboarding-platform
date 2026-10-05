import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Footer from '../PublicEntryLegalFooter.vue';
describe('public form policy ownership', () => {
  it('uses ITSCO policies on shared-host forms and updates when the tenant changes', async () => {
    const wrapper = mount(Footer,{props:{organizationSlug:'itsco'}});
    expect(wrapper.findAll('a').map(a=>a.attributes('href'))).toEqual([
      'https://www.itsco.health/itsco/terms', 'https://www.itsco.health/itsco/privacypolicy', 'https://www.itsco.health/itsco/platformhipaa'
    ]);
    await wrapper.setProps({organizationSlug:'nlu'});
    expect(wrapper.findAll('a').every(a=>a.attributes('href').startsWith('https://nextleveluplcc.com/nlu/'))).toBe(true);
    wrapper.unmount();
  });
});
