import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { createPinia } from 'pinia';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
vi.mock('vue-router', async importOriginal => ({ ...await importOriginal(), useRoute: () => ({ params: {} }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: null }) }));
vi.mock('../../../utils/trainingVideo', () => ({ connectTrainingVideos: vi.fn() }));
import Panel from '../ProviderUpdatePagePanel.vue';

const content = {
  digest: { id: 9, status: 'draft', title: 'October handbook changes' },
  entries: [{ id: 1, subject: 'Workplace policy update', changed_content: '<p>Review this change.</p>' }],
  handbook: { version: { id: 12 }, sections: [{ slug: 'welcome', title: 'Welcome', body_html: '<p>The handbook.</p>', content_status: 'ready' }] }
};
const section = completed => ({ key: 'handbook', completed, data: {}, meta: { title: 'Handbook Updates', mode: 'ack' } });
const bundle = completed => ({ sections: [section(completed)] });
function render({ mode = 'token', completed = false, previewOnly = false } = {}) {
  return mount(defineComponent({
    components: { Panel },
    setup() {
      const page = ref({ key: 'handbook', title: 'Handbook Updates', alone: true, sections: [section(completed)], sectionsTotal: 1, sectionsCompleted: Number(completed) });
      const save = result => { page.value = { ...page.value, sections: result.sections, sectionsCompleted: result.sections.filter(s => s.completed).length }; };
      return { page, save, mode, recipient: { id: 7, previewOnly } };
    },
    template: '<Panel :page="page" :mode="mode" token="invitation" :agency-id="2" :recipient="recipient" @saved="save" />'
  }), { global: { plugins: [createPinia()] } });
}
const saveButton = w => w.get('.ack-row button');
const panel = w => w.getComponent(Panel);
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: content });
  api.put.mockResolvedValue({ data: bundle(true) });
  Element.prototype.scrollIntoView = vi.fn();
});

it.each(['token', 'auth'])('saves the handbook review before continuing for %s access', async mode => {
  const w = render({ mode });
  await flushPromises();
  expect(w.find('.pu-page-footer .primary').exists()).toBe(false);
  expect(saveButton(w).text()).toBe('Save handbook review and continue');
  await saveButton(w).trigger('click');
  await flushPromises();
  expect(api.put).toHaveBeenCalledExactlyOnceWith(
    mode === 'token' ? '/public/provider-update/invitation/sections/handbook' : '/provider-update/me/sections/handbook',
    { ...(mode === 'token' ? {} : { agencyId: 2 }), completed: true, status: 'completed', mode: 'ack', data: { handbookAcknowledged: true, digestId: 9, handbookVersionId: 12 } }
  );
  expect(w.text()).toContain('1 of 1 items complete');
  expect(panel(w).emitted('advance')).toHaveLength(1);
  expect(w.text()).toContain('Your handbook review is saved.');
  w.unmount();
});

it('keeps the completion action available after opening the full handbook', async () => {
  const w = render(); await flushPromises();
  await w.findAll('.reader-tabs button').find(b => b.text() === 'Read handbook').trigger('click');
  expect(w.text()).toContain('The handbook.');
  await saveButton(w).trigger('click'); await flushPromises();
  expect(panel(w).emitted('advance')).toHaveLength(1);
  expect(api.put).toHaveBeenCalledTimes(1);
  w.unmount();
});

it('waits for the save, prevents duplicate writes, and shows failures next to the retry action', async () => {
  let rejectSave;
  api.put.mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject; }));
  const w = render(); await flushPromises();
  await saveButton(w).trigger('click');
  expect(saveButton(w).element.disabled).toBe(true);
  expect(saveButton(w).text()).toContain('Saving handbook review');
  await saveButton(w).trigger('click');
  expect(api.put).toHaveBeenCalledTimes(1);
  expect(panel(w).emitted('advance')).toBeUndefined();
  rejectSave({ response: { data: { error: { message: 'Connection lost. Please try again.' } } } });
  await flushPromises();
  expect(w.get('.ack-row [role="alert"]').text()).toContain('Connection lost');
  expect(saveButton(w).element.disabled).toBe(false);
  expect(w.text()).toContain('0 of 1 items complete');
  expect(panel(w).emitted('advance')).toBeUndefined();
  await saveButton(w).trigger('click'); await flushPromises();
  expect(api.put).toHaveBeenCalledTimes(2);
  expect(panel(w).emitted('advance')).toHaveLength(1);
  w.unmount();
});

it('does not mistake saving a draft or leaving the page for a handbook acknowledgment', async () => {
  const w = render(); await flushPromises();
  expect(await panel(w).vm.saveDraft()).toBe(true);
  await w.findAll('button').find(b => b.text() === 'Back to steps').trigger('click');
  expect(panel(w).emitted('close')).toHaveLength(1);
  expect(api.put).not.toHaveBeenCalled();
  expect(w.text()).toContain('0 of 1 items complete');
  w.unmount();
});

it('offers a load retry instead of a misleading completion action when the handbook fails to load', async () => {
  api.get.mockRejectedValueOnce(Error('network'));
  const w = render(); await flushPromises();
  expect(w.text()).toContain('The handbook could not be loaded.');
  expect(w.find('.ack-row').exists()).toBe(false);
  expect(w.find('.pu-page-footer .primary').exists()).toBe(false);
  await w.get('.reader-error button').trigger('click'); await flushPromises();
  expect(saveButton(w).exists()).toBe(true);
  expect(api.put).not.toHaveBeenCalled();
  w.unmount();
});

it('preserves saved completion when the provider reopens the page and continues', async () => {
  const w = render({ completed: true }); await flushPromises();
  expect(w.text()).toContain('Your handbook review is saved.');
  expect(w.find('.ack-row button').exists()).toBe(false);
  await w.get('.pu-page-footer .primary').trigger('click'); await flushPromises();
  expect(panel(w).emitted('advance')).toHaveLength(1);
  expect(api.put).not.toHaveBeenCalled();
  w.unmount();
});

it('keeps preview navigation read-only', async () => {
  const w = render({ previewOnly: true }); await flushPromises();
  expect(w.find('.ack-row button').exists()).toBe(false);
  await w.get('.pu-page-footer .primary').trigger('click'); await flushPromises();
  expect(panel(w).emitted('advance')).toHaveLength(1);
  expect(api.put).not.toHaveBeenCalled();
  w.unmount();
});
