import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
vi.mock('../../../../services/api', () => ({ default: { get: vi.fn(async url => ({ data: url.includes('family-document-sessions') ? { guardians: [] } : {} })) } }));
import Panel from '../ClientDisclosurePanel.vue';
let wrapper;
beforeEach(() => localStorage.clear());
afterEach(() => wrapper?.unmount());
it.each(['admin', 'support'])('shows document viewing only when %s can open chart artifacts', async role => {
  localStorage.setItem('user', JSON.stringify({ id: 4, role }));
  wrapper = shallowMount(Panel, { props: { clientId: 7, client: { agency_id: 2 } }, global: { plugins: [createPinia()] } });
  await flushPromises();
  const view = wrapper.findAll('button').find(button => button.text() === 'View disclosure');
  expect(!!view).toBe(role === 'admin');
  expect(wrapper.get('[aria-label="Family documents"]').exists()).toBe(true);
  if (view) { await view.trigger('click'); expect(wrapper.emitted('view-artifact')).toEqual([['disclosure-html']]); }
});
