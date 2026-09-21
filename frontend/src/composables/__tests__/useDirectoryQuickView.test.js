import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { useDirectoryQuickView } from '../useDirectoryQuickView';

let wrapper;
let preview;
beforeEach(() => {
  vi.useFakeTimers();
  wrapper = mount({ setup() { preview = useDirectoryQuickView(); return {}; }, template: '<div />' });
});
afterEach(() => { wrapper.unmount(); vi.useRealTimers(); });

it('ignores a passing hover and opens only after deliberate dwell', () => {
  preview.scheduleOpen({ id: 1 });
  vi.advanceTimersByTime(200);
  preview.cancelOpen();
  vi.advanceTimersByTime(500);
  expect(preview.selectedUser.value).toBeNull();
  preview.scheduleOpen({ id: 2 });
  vi.advanceTimersByTime(450);
  expect(preview.selectedUser.value.id).toBe(2);
});
it('allows entering the panel, then dismisses after leaving', () => {
  preview.scheduleOpen({ id: 1 });
  vi.advanceTimersByTime(450);
  preview.cancelOpen();
  vi.advanceTimersByTime(150);
  preview.keepOpen();
  vi.advanceTimersByTime(500);
  expect(preview.selectedUser.value.id).toBe(1);
  preview.scheduleClose();
  vi.advanceTimersByTime(350);
  expect(preview.selectedUser.value).toBeNull();
});
it('cancels pending opens on outside interaction and Escape', () => {
  preview.scheduleOpen({ id: 1 });
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  vi.advanceTimersByTime(500);
  expect(preview.selectedUser.value).toBeNull();
  preview.scheduleOpen({ id: 2 });
  vi.advanceTimersByTime(450);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(preview.selectedUser.value).toBeNull();
});
it('does not replace the current user after a cancelled switch or unmount', () => {
  preview.scheduleOpen({ id: 1 });
  vi.advanceTimersByTime(450);
  preview.scheduleOpen({ id: 2 });
  preview.cancelOpen();
  preview.keepOpen();
  vi.advanceTimersByTime(500);
  expect(preview.selectedUser.value.id).toBe(1);
  preview.scheduleOpen({ id: 3 });
  wrapper.unmount();
  vi.advanceTimersByTime(500);
  expect(preview.selectedUser.value).toBeNull();
});
