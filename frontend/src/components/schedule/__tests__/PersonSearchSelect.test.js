import { afterEach, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PersonSearchSelect from '../PersonSearchSelect.vue';
const options = [
  { id: 1, first_name: 'Melissa', last_name: 'Mendez', photoUrl: '/uploads/melissa.jpg' },
  { id: 2, first_name: 'Michael', last_name: 'Mendez', role: 'super_admin' },
  { id: 3, first_name: 'Devon', last_name: 'Rodriguez', email: 'mendez-administration@example.org' }
];
let wrapper;
afterEach(() => wrapper?.unmount());
it('matches typed names rather than unrelated letters or email fragments', async () => {
  wrapper = mount(PersonSearchSelect, { props: { options, showPhotos: true } });
  await wrapper.get('input').setValue('melissa');
  expect(wrapper.findAll('[role="option"]').map(o => o.text())).toEqual(['Mendez, Melissa']);
  expect(wrapper.get('[role="option"] img').attributes('src')).toBe('/uploads/melissa.jpg');
  await wrapper.get('input').setValue('mendez');
  expect(wrapper.findAll('[role="option"]')).toHaveLength(2);
  await wrapper.get('input').setValue('Michael Mendez');
  expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
  await wrapper.get('input').trigger('keydown', { key: 'Enter' });
  expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([2]);
});
it('keeps the new search when clearing a previously selected person', async () => {
  wrapper = mount(PersonSearchSelect, { props: { options, modelValue: 1 } });
  await wrapper.get('input').setValue('michael');
  await wrapper.setProps({ modelValue: 0 });
  expect(wrapper.get('input').element.value).toBe('michael');
  expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
});
