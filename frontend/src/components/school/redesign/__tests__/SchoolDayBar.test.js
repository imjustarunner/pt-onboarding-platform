import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SchoolDayBar from '../SchoolDayBar.vue';

describe('SchoolDayBar', () => {
  it('renders Mon–Fri and emits selection', async () => {
    const wrapper = mount(SchoolDayBar, {
      props: {
        modelValue: 'Monday',
        days: [
          { weekday: 'Monday', has_providers: true },
          { weekday: 'Tuesday', has_providers: false },
          { weekday: 'Wednesday', has_providers: true },
          { weekday: 'Thursday', has_providers: false },
          { weekday: 'Friday', has_providers: false }
        ]
      }
    });

    const buttons = wrapper.findAll('button.day');
    expect(buttons.length).toBe(5);
    expect(wrapper.text()).toContain('Mon');

    // Disabled day should not be selectable
    await buttons[1].trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    // Enabled day should emit selection
    await buttons[2].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Wednesday']);
  });
});

