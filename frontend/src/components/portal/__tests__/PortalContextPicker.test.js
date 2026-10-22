import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Picker from '../PortalContextPicker.vue';

const groups = [
  { label: 'ITSCO', options: [{ value: '2:1', label: 'Avery Bennett' }, { value: '2:2', label: 'Riley Bennett' }] },
  { label: 'Next Level Up', options: [{ value: '6:3', label: 'Jordan Bennett' }] }
];
it('supports keyboard selection across agency groups and restores trigger focus', async () => {
  const w = mount(Picker, { attachTo: document.body, props: { label: 'Viewing', modelValue: '2:1', groups } });
  const trigger = w.find('.picker-trigger');
  await trigger.trigger('keydown', { key: 'ArrowDown' });
  expect(document.activeElement.textContent).toContain('Avery');
  await w.find('[role=listbox]').trigger('keydown', { key: 'End' });
  expect(document.activeElement.textContent).toContain('Jordan');
  document.activeElement.click();
  await nextTick();
  expect(w.emitted('update:modelValue')).toEqual([['6:3']]);
  expect(trigger.attributes('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger.element);
  w.unmount();
});
it('dismisses with Escape, outside clicks and focus leaving without changing selection', async () => {
  const w = mount(Picker, { attachTo: document.body, props: { label: 'Viewing', modelValue: '2:2', groups } });
  const trigger = w.find('.picker-trigger');
  await trigger.trigger('click');
  expect(document.activeElement.textContent).toContain('Riley');
  await w.find('[role=listbox]').trigger('keydown', { key: 'Escape' });
  expect(document.activeElement).toBe(trigger.element);
  expect(w.find('[role=listbox]').exists()).toBe(false);
  await trigger.trigger('click');
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await nextTick();
  expect(w.find('[role=listbox]').exists()).toBe(false);
  await trigger.trigger('click');
  await w.trigger('focusout', { relatedTarget: document.body });
  expect(w.find('[role=listbox]').exists()).toBe(false);
  expect(w.emitted('update:modelValue')).toBeUndefined();
  w.unmount();
});
