import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'itsco' } }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
import api from '../../../services/api';
import Panel from '../ProviderUpdateSectionPanel.vue';

const client = id => ({ id, firstName: `Client ${id}`, lifecycleAction: { actionKey: 'provider_intake', label: 'New Client – Action Needed' }, checklist: { parentsContactedAt: '', parentsContactedSuccessful: '', firstServiceAt: '' } });
let clients;
beforeEach(() => {
  vi.resetAllMocks();
  clients = [client(1), client(2)];
  api.get.mockImplementation(async () => ({ data: { clients: structuredClone(clients) } }));
  api.put.mockImplementation(async (url, data) => {
    if (url.includes('/fall-actions/')) {
      const row = clients.find(c => c.id === Number(url.split('/').at(-1)));
      for (const key of Object.keys(row.checklist)) if (key in data) row.checklist[key] = data[key];
      return { data: { serviceConfirmation: { confirmed: false, message: 'Checklist saved. Record a completed service date in the current school year to confirm Being Seen.' } } };
    }
    return { data: { sections: [] } };
  });
});
async function render(props = {}) {
  const wrapper = mount(Panel, { props: { agencyId: 2, mode: 'token', token: 'sample', recipient: { providerUserId: 7, agencyId: 2 }, section: { key: 'client_fall_update', data: {} }, ...props }, global: { stubs: { ProviderUpdateHelp: true, ProviderUpdateTrainingGuides: true } } });
  await flushPromises();
  return wrapper;
}
const row = (w, id) => w.findAll('.fall-list > li').find(r => r.text().includes(`Client ${id}`));
const contact = (w, id) => row(w, id).findAll('input[type=date]')[0];
const review = w => w.findAll('button').find(b => /Mark Fall actions reviewed|Save changes.*mark reviewed/i.test(b.text()));

it('shows the server save result even when a client still has pending steps', async () => {
  const w = await render();
  await contact(w, 1).setValue('2026-10-06');
  await row(w, 1).get('button.primary').trigger('click'); await flushPromises();
  expect(w.get('[role=status]').text()).toContain('Client 1');
  expect(w.get('[role=status]').text()).toContain('Checklist saved. Record a completed service date');
  expect(row(w, 1).get('.fall-save-notice').text()).toContain('Checklist saved.');
  expect(contact(w, 1).element.value).toBe('2026-10-06');
  w.unmount();
});
it('preserves edits to another client when saving or refreshing the list', async () => {
  const w = await render();
  await contact(w, 1).setValue('2026-10-06'); await contact(w, 2).setValue('2026-10-07');
  await row(w, 1).get('button.primary').trigger('click'); await flushPromises();
  expect(contact(w, 2).element.value).toBe('2026-10-07');
  await w.findAll('button').find(b => b.text() === 'Refresh list').trigger('click'); await flushPromises();
  expect(contact(w, 2).element.value).toBe('2026-10-07');
  expect(api.put).toHaveBeenCalledTimes(1);
  w.unmount();
});
it('saves changed client fields before Save for later and does not repeat unchanged saves', async () => {
  const w = await render({ mode: 'me', token: '' });
  await contact(w, 1).setValue('2026-10-06');
  expect(await w.vm.saveDraft()).toBe(true);
  expect(api.put).toHaveBeenCalledWith('/provider-update/me/fall-actions/1', expect.objectContaining({ agencyId: 2, parentsContactedAt: '2026-10-06' }));
  expect(await w.vm.saveDraft()).toBe(true); expect(api.put).toHaveBeenCalledTimes(1);
  w.unmount();
});
it('saves all edited clients before marking the section reviewed', async () => {
  const w = await render();
  await contact(w, 1).setValue('2026-10-06'); await contact(w, 2).setValue('2026-10-07');
  await review(w).trigger('click'); await flushPromises();
  expect(api.put.mock.calls.map(([url]) => url)).toEqual(['/public/provider-update/sample/fall-actions/1', '/public/provider-update/sample/fall-actions/2', '/public/provider-update/sample/sections/client_fall_update']);
  expect(api.put.mock.calls[2][1].completed).toBe(true);
  w.unmount();
});
it('keeps entered values and blocks completion or navigation when a client save fails', async () => {
  const w = await render();
  await contact(w, 1).setValue('2026-10-06');
  api.put.mockRejectedValue({ response: { data: { error: { message: 'Client save failed. Please retry.' } } } });
  await review(w).trigger('click'); await flushPromises();
  expect(api.put.mock.calls.every(([url]) => url.includes('/fall-actions/'))).toBe(true);
  expect(row(w, 1).get('[role=alert]').text()).toContain('Client save failed');
  expect(contact(w, 1).element.value).toBe('2026-10-06');
  expect(await w.vm.saveDraft()).toBe(false);
  expect(w.emitted('saved')).toBeUndefined();
  api.put.mockResolvedValue({ data: {} });
  await review(w).trigger('click'); await flushPromises();
  expect(w.emitted('saved')).toBeTruthy();
  w.unmount();
});
it('keeps confirmation visible when the saved client no longer needs an action', async () => {
  const w = await render();
  await contact(w, 1).setValue('2026-10-06');
  api.put.mockImplementationOnce(async () => { clients = [client(2)]; return { data: { confirmed: true, message: 'Being Seen confirmed.' } }; });
  await row(w, 1).get('button.primary').trigger('click'); await flushPromises();
  expect(row(w, 1)).toBeUndefined();
  expect(w.get('[role=status]').text()).toContain('Client 1: Being Seen confirmed.');
  w.unmount();
});
it('retains other entered values if refresh fails after a successful save and does not claim section completion', async () => {
  const w = await render();
  await contact(w, 1).setValue('2026-10-06'); await contact(w, 2).setValue('2026-10-07');
  api.get.mockRejectedValueOnce(Error('Network interrupted'));
  await row(w, 1).get('button.primary').trigger('click'); await flushPromises();
  expect(w.get('[role=status]').text()).toContain('Checklist saved.');
  expect(contact(w, 2).element.value).toBe('2026-10-07');
  expect(review(w).element.disabled).toBe(true);
  expect(w.emitted('saved')).toBeUndefined();
  await w.findAll('button').find(b => b.text() === 'Refresh list').trigger('click'); await flushPromises();
  expect(contact(w, 2).element.value).toBe('2026-10-07');
  expect(review(w).element.disabled).toBe(false);
  w.unmount();
});
it('does not save client changes from a read-only preview', async () => {
  const w = await render({ recipient: { providerUserId: 7, agencyId: 2, previewOnly: true } });
  expect(await w.vm.saveDraft()).toBe(true);
  expect(api.put).not.toHaveBeenCalled();
  expect(w.get('fieldset.preview-fields').element.disabled).toBe(true);
  w.unmount();
});
