import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ClientInitialsList from '../ClientInitialsList.vue';

describe('ClientInitialsList', () => {
  it('shows codes by default and initials when toggled', async () => {
    const client = { id: 1, initials: 'ABCDEF', identifier_code: 'CODE123' };

    const wrapper = mount(ClientInitialsList, {
      props: {
        clients: [client]
      }
    });

    expect(wrapper.text()).toContain('COD123'); // first 3 + last 3

    await wrapper.setProps({ clientLabelMode: 'initials' });
    expect(wrapper.text()).toContain('ABCDEF');
  });
});

