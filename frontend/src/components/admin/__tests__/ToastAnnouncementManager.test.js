import { mount, flushPromises } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import ToastAnnouncementManager from '../ToastAnnouncementManager.vue';
it('creates a reusable support closure example without publishing until requested', async () => {
  const request = vi.fn().mockResolvedValue([]);
  const w = mount(ToastAnnouncementManager, { props: { request, basePath: '/support-toasts', support: true } }); await flushPromises();
  const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  await w.get('input[type="date"]').setValue(tomorrow);
  await w.findAll('button').find((b) => b.text() === 'Use closure example').trigger('click');
  expect(w.get('textarea').element.value).toContain('AuricWell support is out of office today and will return on');
  expect(request).toHaveBeenCalledTimes(1);
  expect(w.find('select').exists()).toBe(false);
  await w.findAll('button').find((b) => b.text() === 'Save draft').trigger('click'); await flushPromises();
  expect(request).toHaveBeenCalledWith('/support-toasts', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ display_type: 'toast', publish_status: 'draft' }) }));
  expect(w.text()).toContain('Draft saved.'); w.unmount();
});
it('loads and edits an existing scheduled toast instead of creating a duplicate', async () => {
  const start = new Date(Date.now() + 86400000), end = new Date(Date.now() + 2 * 86400000);
  const request = vi.fn().mockResolvedValue([{ id: 42, title: 'Closed', message: 'Return Monday', starts_at: start.toISOString(), ends_at: end.toISOString(), publish_status: 'published' }]);
  const w = mount(ToastAnnouncementManager, { props: { request, basePath: '/practices/test/toasts' } }); await flushPromises();
  await w.findAll('button').find((b) => b.text() === 'Edit').trigger('click');
  await w.get('textarea').setValue('Return Tuesday'); await w.get('form').trigger('submit'); await flushPromises();
  expect(request).toHaveBeenCalledWith('/practices/test/toasts/42', expect.objectContaining({ method: 'PUT', body: expect.objectContaining({ message: 'Return Tuesday', display_type: 'toast' }) }));
  w.unmount();
});
