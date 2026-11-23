import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import View from '../UnassignedDocumentsView.vue';
import api from '../../../services/api';
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { agencyId: '2' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({}) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../../components/school/ReferralUpload.vue', () => ({ default: { props: ['organizationSlug', 'initialDraftId'], template: '<div data-testid="review">Reviewing {{ initialDraftId }}</div>' } }));
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async url => {
    if (url === '/agencies') return { data: [{ id: 2, name: 'Example agency' }] };
    if (url.endsWith('/packet-drafts')) return { data: { total: 1, drafts: [{ id: 11, initials: 'SynStu', organization_name: 'Example school', organization_slug: 'example-school', uploader_name: 'Synthetic Uploader', created_at: '2026-11-19T19:51:00Z', status: 'draft', file_available: 1 }] } };
    return { data: [] };
  });
});
it('shows packets even when there are no submitted public-form documents and opens the selected draft', async () => {
  const w = mount(View); await flushPromises();
  expect(w.text()).toContain('Unsubmitted Packets (1)'); expect(w.text()).toContain('Synthetic Uploader');
  expect(api.get).toHaveBeenCalledWith('/unassigned-documents/packet-drafts', { params: { agencyId: '2', limit: 50, offset: 0 } });
  await w.findAll('button').find(b => b.text() === 'Review / Resume').trigger('click');
  expect(w.get('[data-testid="review"]').text()).toContain('11'); w.unmount();
});
it('keeps a queue-load failure distinct from an empty queue', async () => {
  api.get.mockImplementation(async url => {
    if (url.endsWith('/packet-drafts')) throw new Error('offline');
    return { data: [] };
  });
  const w = mount(View); await flushPromises();
  expect(w.text()).toContain('Could not load unfinished packets'); expect(w.text()).not.toContain('No unfinished packet uploads'); w.unmount();
});
