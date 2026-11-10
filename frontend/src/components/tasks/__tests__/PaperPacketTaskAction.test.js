import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../school/ReferralUpload.vue', () => ({ default: { props: ['initialDraft', 'organizationSlug'], emits: ['submitted'], template: '<button @click="$emit(\'submitted\')">Attach saved packet</button>' } }));
vi.mock('../../clients/SchoolPaperPacketWorkflow.vue', () => ({ default: { props: ['clientId'], template: '<div>Processing child {{ clientId }}</div>' } }));
import api from '../../../services/api';
import Action from '../PaperPacketTaskAction.vue';
beforeEach(() => vi.resetAllMocks());
it('resumes its exact upload, then opens the matched child processor after attachment', async () => {
  api.get.mockResolvedValueOnce({ data: { draft: { id: 20, phiDocumentId: 30, organizationSlug: 'qa-school', clientId: null } } })
    .mockResolvedValueOnce({ data: { draft: { id: 20, phiDocumentId: 30, organizationSlug: 'qa-school', clientId: 55 } } });
  const w = mount(Action, { props: { draftId: 20 }, global: { stubs: { Teleport: true } } });
  await w.get('button').trigger('click'); await flushPromises();
  expect(w.findComponent({ name: 'ReferralUpload' }).exists() || w.text().includes('Attach saved packet')).toBe(true);
  await w.findAll('button').at(-1).trigger('click'); await flushPromises();
  expect(w.text()).toContain('Processing child 55');
  expect(api.get.mock.calls.map(call => call[0])).toEqual(['/referral-packet-drafts/20/processing', '/referral-packet-drafts/20/processing']);
  w.unmount();
});
it('shows denied or replaced-source errors without opening another child', async () => {
  api.get.mockRejectedValue({ response: { data: { error: { message: 'This task does not match the current packet.' } } } });
  const w = mount(Action, { props: { draftId: 20 } });
  await w.get('button').trigger('click'); await flushPromises();
  expect(w.get('[role=alert]').text()).toContain('does not match'); expect(w.text()).not.toContain('Processing child'); w.unmount();
});
