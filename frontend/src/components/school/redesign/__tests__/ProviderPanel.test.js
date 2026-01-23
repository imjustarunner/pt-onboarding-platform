import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ProviderPanel from '../ProviderPanel.vue';

describe('ProviderPanel', () => {
  it('emits open-client when a caseload chip is clicked', async () => {
    const wrapper = mount(ProviderPanel, {
      props: {
        provider: { provider_user_id: 7, first_name: 'A', last_name: 'B', slots_total: 7, slots_available: 7 },
        caseloadClients: [{ id: 1, initials: 'ABCDEF' }],
        slots: [{ id: 10, client_id: null, start_time: null, end_time: null, note: null }],
        loading: false,
        saving: false,
        error: ''
      }
    });

    const chip = wrapper.find('button.chip');
    await chip.trigger('click');
    expect(wrapper.emitted('open-client')?.[0]?.[0]).toMatchObject({ id: 1 });
  });
});

