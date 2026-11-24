import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Upload from '../ReferralUpload.vue';
import api from '../../../services/api';
const m = vi.hoisted(() => ({ leave: null }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: fn => { m.leave = fn; } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ isAuthenticated: true, user: { id: 7, role: 'provider_plus' } }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('../../documents/PDFPreview.vue', () => ({ default: { template: '<div />' } }));
const draft = (id, extra = {}) => ({ id, organizationId: 20, agencyId: 2, phiDocumentId: id + 100, firstName: 'Synthetic', lastName: 'Student', initials: 'SynStu', status: 'draft', submissionDate: '2026-11-19', ...extra });
let w;
const button = text => w.findAll('button').find(b => b.text() === text);
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async url => url.includes('latest-draft') ? { data: { drafts: [draft(11), draft(10)] } } : { data: {} });
  api.post.mockResolvedValue({ data: { clientId: 30, draftId: 11 } });
});
afterEach(() => w?.unmount());
it('restores older drafts and submits the selected draft with its original date', async () => {
  w = mount(Upload, { props: { organizationSlug: 'example-school' } }); await flushPromises();
  expect(w.findAll('#saved-packet-draft option')).toHaveLength(2);
  await w.get('#saved-packet-draft').setValue('10');
  await button('Resume this packet').trigger('click'); await flushPromises();
  expect(w.text()).toContain('referral not submitted');
  await button('Submit Client').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/organizations/example-school/upload-referral/10/submit', expect.objectContaining({ submissionDate: '2026-11-19' }));
  expect(w.text()).toContain('Client created successfully');
});
it('guards the close button, background click, cancel, route change and browser exit', async () => {
  w = mount(Upload, { props: { organizationSlug: 'example-school' } }); await flushPromises();
  await button('Resume this packet').trigger('click'); await flushPromises();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await w.get('.btn-close').trigger('click');
  await w.get('.modal-overlay').trigger('click');
  await button('Cancel').trigger('click');
  expect(m.leave()).toBe(false);
  expect(confirm).toHaveBeenCalledTimes(4); expect(w.emitted('close')).toBeUndefined();
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  confirm.mockReturnValue(true); await w.get('.btn-close').trigger('click'); expect(w.emitted('close')).toHaveLength(1);
});
it('surfaces lookup failures and lets the user retry instead of silently losing recovery', async () => {
  api.get.mockRejectedValueOnce(new Error('offline'));
  w = mount(Upload, { props: { organizationSlug: 'example-school' } }); await flushPromises();
  expect(w.text()).toContain('Could not check saved drafts');
  expect(button('Upload Referral Packet').attributes('disabled')).toBeDefined();
  await button('Retry').trigger('click'); await flushPromises(); expect(button('Resume this packet')).toBeDefined();
});
it('loads the exact packet selected by an administrator', async () => {
  api.get.mockImplementation(async url => url.includes('latest-draft') ? { data: { draft: draft(9) } } : { data: {} });
  w = mount(Upload, { props: { organizationSlug: 'example-school', initialDraftId: 9 } }); await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/organizations/example-school/upload-referral/latest-draft', { params: { draftId: 9 } });
  await button('Submit Client').trigger('click'); await flushPromises();
  expect(api.post.mock.calls[0][0]).toBe('/organizations/example-school/upload-referral/9/submit');
});
it('retains a failed submission for retry and does not emit completion', async () => {
  api.post.mockRejectedValueOnce(new Error('offline'));
  w = mount(Upload, { props: { organizationSlug: 'example-school' } }); await flushPromises();
  await button('Resume this packet').trigger('click'); await flushPromises();
  await button('Submit Client').trigger('click'); await flushPromises();
  expect(w.text()).toContain('Failed to submit client'); expect(button('Submit Client')).toBeDefined();
  expect(w.emitted('uploaded')).toBeUndefined();
});
