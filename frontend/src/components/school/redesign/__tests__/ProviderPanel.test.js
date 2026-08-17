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
    expect(wrapper.emitted('open-client')?.[0]?.[0]).toMatchObject({
      client: { id: 1, initials: 'ABCDEF' },
      navigationClientIds: [1]
    });
  });

  it('shows open slots from the soft schedule grid instead of caseload size', () => {
    const wrapper = mount(ProviderPanel, {
      props: {
        provider: {
          provider_user_id: 7,
          first_name: 'Halle',
          last_name: 'Brimm',
          slots_total: 8,
          slots_used: 7,
          slots_available: 1
        },
        caseloadClients: [
          { id: 1, initials: 'AAAAAA' },
          { id: 2, initials: 'BBBBBB' },
          { id: 3, initials: 'CCCCCC' },
          { id: 4, initials: 'DDDDDD' }
        ],
        slots: [
          { id: 1, client_id: null },
          { id: 2, client_id: 1 },
          { id: 3, client_id: 2 },
          { id: 4, client_id: null },
          { id: 5, client_id: 3 },
          { id: 6, client_id: 4 },
          { id: 7, client_id: null },
          { id: 8, client_id: null }
        ],
        loading: false,
        saving: false,
        error: ''
      }
    });

    expect(wrapper.text()).toContain('4 / 8 assigned');
    expect(wrapper.text()).toContain('4 open');
  });
});

