import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Picker from '../ScheduleQuarterHourPicker.vue';
let wrapper;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
const openPicker = () => {
  wrapper = mount(Picker, { props: { hour: 7 }, attachTo: document.body });
  return wrapper;
};
it('waits one second near the plus, then offers four starts without opening an appointment', async () => {
  openPicker();
  await wrapper.find('.schedule-quarter-picker').trigger('mouseenter');
  await vi.advanceTimersByTimeAsync(999);
  expect(document.querySelector('.schedule-quarter-menu')).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect(document.querySelectorAll('.schedule-quarter-menu button')).toHaveLength(4);
  expect(wrapper.emitted('select')).toBeUndefined();
  document.querySelectorAll('.schedule-quarter-menu button')[2].click();
  expect(wrapper.emitted('select')).toEqual([[30]]);
});
it('cancels a short hover and opens immediately by click for touch users', async () => {
  openPicker();
  await wrapper.find('.schedule-quarter-picker').trigger('mouseenter');
  await wrapper.find('.schedule-quarter-picker').trigger('mouseleave');
  await vi.advanceTimersByTimeAsync(1100);
  expect(document.querySelector('.schedule-quarter-menu')).toBeNull();
  await wrapper.find('button').trigger('click');
  expect(document.querySelector('.schedule-quarter-menu')).not.toBeNull();
});
it('does not open while drag-selecting and supports Escape without selecting', async () => {
  openPicker();
  await wrapper.find('.schedule-quarter-picker').trigger('mouseenter', { buttons: 1 });
  await vi.advanceTimersByTimeAsync(1100);
  expect(document.querySelector('.schedule-quarter-menu')).toBeNull();
  await wrapper.find('button').trigger('click');
  document.querySelector('.schedule-quarter-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await vi.advanceTimersByTimeAsync(1);
  expect(document.querySelector('.schedule-quarter-menu')).toBeNull();
  expect(wrapper.emitted('select')).toBeUndefined();
});

it('closes cleanly on resize and moves keyboard focus into the choices', async () => {
  openPicker();
  await wrapper.find('button').trigger('click');
  expect(document.activeElement).toBe(document.querySelector('.schedule-quarter-menu button'));
  window.dispatchEvent(new Event('resize'));
  await vi.advanceTimersByTimeAsync(1);
  expect(document.querySelector('.schedule-quarter-menu')).toBeNull();
});
