import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Landing from '../AdaptiveJoinLanding.vue';
import { createJoinDesign } from '../../../utils/joinPageDesign';
const quick = { title: 'Interest form', cta: 'Start', bullets: [] };
const full = { title: 'Enrollment', cta: 'Enroll', enabled: false, disabledReason: 'Enrollment not enabled', bullets: [] };
describe('Join public and design renderer', () => {
  it('keeps real intake actions functional and respects unavailable enrollment', async () => {
    const wrapper = mount(Landing, { props: { config: { copy: {} }, quick, full } });
    await wrapper.find('.ajl-card--quick button').trigger('click'); expect(wrapper.emitted('continue')).toEqual([['quick']]);
    expect(wrapper.find('.ajl-card--full button').attributes('disabled')).toBeDefined(); wrapper.unmount();
  });
  it('selects elements in the canvas without starting an intake', async () => {
    const wrapper = mount(Landing, { props: { config: { copy: {} }, quick, full, designMode: true } });
    await wrapper.find('.ajl-card--quick button').trigger('click');
    expect(wrapper.emitted('continue')).toBeUndefined(); expect(wrapper.emitted('select-element')).toEqual([['quick']]); wrapper.unmount();
  });
  it('renders the mobile order, visibility, and copy instead of the desktop version', async () => {
    const layout = { design: createJoinDesign() }; layout.design.views.mobile.copy.welcomeTitle = 'Mobile heading';
    layout.design.views.mobile.order.main = ['welcome', 'cards', 'lead', 'glad']; layout.design.views.mobile.hidden.script = true;
    const wrapper = mount(Landing, { props: { config: { copy: { welcomeTitle: 'Desktop heading', layout } }, quick, full } });
    const previous = window.innerWidth; window.innerWidth = 390; window.dispatchEvent(new Event('resize')); await wrapper.vm.$nextTick();
    expect(wrapper.find('h1').text()).toBe('Mobile heading'); expect(wrapper.find('.ajl-block--script').exists()).toBe(false);
    expect(wrapper.findAll('.ajl-main > section').map(x => x.attributes('data-design-element'))).toEqual(['welcome', 'cards', 'lead', 'glad']);
    window.innerWidth = previous; wrapper.unmount();
  });
});
