import { shallowMount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { locationId: '3' } }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }) } }));
import KioskView from '../../../views/KioskView.vue';
function mountKiosk(locationSettings) {
  return shallowMount(KioskView, { props: { locationSettings }, global: { stubs: {
    KioskWelcomeView: { template: '<div data-lobby><slot name="actions" /></div>' }
  } } });
}
describe('office kiosk entry points', () => {
  it('opens the provider lobby on existing public office links', () => {
    const wrapper = mountKiosk(null); expect(wrapper.find('[data-lobby]').exists()).toBe(true); wrapper.unmount();
  });
  it('opens the provider lobby for shared stations and preserves other modes', async () => {
    const wrapper = mountKiosk({ allowed_modes: ['clock', 'client_check_in', 'skill_builders'], show_mode_selector: true });
    expect(wrapper.find('[data-lobby]').exists()).toBe(true);
    await wrapper.get('[data-lobby] button').trigger('click');
    expect(wrapper.text()).toContain('What would you like to do?');
    expect(wrapper.text()).toContain('Skill Builders time');
    await wrapper.findAll('.mode-btn').find(button => button.text().includes('Client Check-in')).trigger('click');
    expect(wrapper.find('[data-lobby]').exists()).toBe(true); wrapper.unmount();
  });
  it('respects stations explicitly configured for staff-only clock-in', async () => {
    const wrapper = mountKiosk({ allowed_modes: ['clock'], default_mode: 'clock', show_mode_selector: false, kiosk_type: 'staff' });
    await flushPromises(); expect(wrapper.find('[data-lobby]').exists()).toBe(false); expect(wrapper.text()).toContain('Clock In / Out'); wrapper.unmount();
  });
});
