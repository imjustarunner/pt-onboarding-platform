import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import api from '../../../services/api';
import { isLoading } from '../../../utils/pageLoader';
import Panel from '../StaffPollsPanel.vue';

const poll = { id: 12, title: 'Staff date', question: 'Which day?', options: [{ key: '1', label: 'Tuesday' }] };
const originalAdapter = api.defaults.adapter;
let wrapper, requests;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear(); sessionStorage.clear();
  requests = [];
  api.defaults.adapter = config => new Promise((resolve, reject) => requests.push({
    config,
    finish: (data = [poll]) => resolve({ data, status: 200, statusText: 'OK', headers: {}, config }),
    fail: () => reject(Object.assign(new Error('offline'), { config }))
  }));
});
afterEach(async () => {
  wrapper?.unmount(); wrapper = null;
  requests.forEach(request => request.finish());
  await flushPromises();
  api.defaults.adapter = originalAdapter;
  vi.useRealTimers();
});

async function open() {
  wrapper = mount(Panel, { props: { agencyId: 2 } });
  wrapper.get('details').element.open = true;
  await wrapper.get('details').trigger('toggle');
  await flushPromises();
}
async function loaded() {
  await open(); requests[0].finish(); await flushPromises();
}

it('uses inline progress for initial and manual loads without covering the dashboard', async () => {
  await open();
  expect(wrapper.text()).toContain('Loading team polls…');
  expect(isLoading.value).toBe(false);
  requests[0].finish(); await flushPromises();
  await wrapper.findAll('button').find(button => button.text() === 'Refresh polls').trigger('click'); await flushPromises();
  expect(requests).toHaveLength(2);
  expect(wrapper.get('.poll-footer').text()).toContain('Refreshing…');
  expect(isLoading.value).toBe(false);
  requests[1].finish(); await flushPromises();
  expect(wrapper.text()).toContain('Which day?');
});

it.each(['timer', 'focus', 'visibility'])('keeps polls visible during a %s refresh and coalesces overlapping triggers', async trigger => {
  await loaded();
  if (trigger === 'timer') await vi.advanceTimersByTimeAsync(30000);
  else if (trigger === 'focus') window.dispatchEvent(new Event('focus'));
  else document.dispatchEvent(new Event('visibilitychange'));
  await flushPromises();
  expect(requests).toHaveLength(2);
  expect(wrapper.text()).toContain('Which day?');
  expect(wrapper.text()).not.toContain('Loading team polls…');
  expect(isLoading.value).toBe(false);
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(30000); await flushPromises();
  expect(requests).toHaveLength(2);
  requests[1].finish([{ ...poll, myResponse: { original: 'Tuesday' } }]); await flushPromises();
  expect(wrapper.text()).toContain('You voted');
  expect(isLoading.value).toBe(false);
});

it('keeps existing polls on a background failure and allows the next refresh', async () => {
  await loaded();
  window.dispatchEvent(new Event('focus')); await flushPromises();
  requests[1].fail(); await flushPromises();
  await vi.waitFor(() => expect(wrapper.find('[role=alert]').exists()).toBe(true));
  expect(wrapper.text()).toContain('Which day?');
  expect(wrapper.get('[role=alert]').text()).toContain('Unable to load');
  expect(isLoading.value).toBe(false);
  window.dispatchEvent(new Event('focus')); await flushPromises();
  expect(requests).toHaveLength(3);
  requests[2].finish(); await flushPromises();
  expect(wrapper.find('[role=alert]').exists()).toBe(false);
});

it('starts a fresh agency load while an old refresh is pending and ignores its late reply', async () => {
  await loaded();
  window.dispatchEvent(new Event('focus')); await flushPromises();
  await wrapper.setProps({ agencyId: 3 }); await flushPromises();
  expect(requests).toHaveLength(3);
  requests[1].finish(); await flushPromises();
  window.dispatchEvent(new Event('focus')); await flushPromises();
  expect(requests).toHaveLength(3);
  expect(wrapper.text()).toContain('Loading team polls…');
  requests[2].finish([{ ...poll, title: 'New agency poll' }]); await flushPromises();
  expect(wrapper.text()).toContain('New agency poll');
  expect(wrapper.text()).not.toContain('Staff date');
  expect(isLoading.value).toBe(false);
});
