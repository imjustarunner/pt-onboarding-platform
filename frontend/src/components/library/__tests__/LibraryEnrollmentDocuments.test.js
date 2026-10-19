import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Enrollment from '../LibraryEnrollmentDocuments.vue';
import api from '../../../services/api';
const state = vi.hoisted(() => ({ user: { role: 'admin' } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => state }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock('../../admin/RichTextEditor.vue', () => ({ default: { props: ['content'], template: '<textarea aria-label="Source text" :value="content.content" @input="$emit(\'update\', {content: $event.target.value})" />' } }));
vi.mock('../../clinical/NoteAidClientPicker.vue', () => ({ default: { props: ['modelValue', 'agencyId', 'searchAllTenants', 'disabled'], template: '<input aria-label="Client picker" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' } }));
const disclosure = { key: 'disclosure', title: 'Provider disclosure', html: '<p>Our practice disclosure</p><p>Current Provider, LPC</p>', editableHtml: '<p>Our practice disclosure</p>', editable: true, version: 3, hash: 'snapshot', protectedNote: 'The current provider roster is generated automatically and cannot be edited here.' };
const intake = { key: 'enrollment', title: 'Enrollment form', html: '<p>Current questions</p>', editable: false, version: 1 };
const catalog = () => ({ agency: { id: 2, name: 'ITSCO' }, canEdit: true, services: [{ key: 'counseling', label: 'Counseling' }, { key: 'tutoring', label: 'Tutoring' }], documents: [structuredClone(disclosure), structuredClone(intake)] });
let wrapper, anchorClick, confirm;
const button = label => wrapper.findAll('button').find(item => item.text() === label);
async function render(props = {}) { wrapper = mount(Enrollment, { props: { agencyId: 2, ...props } }); await flushPromises(); return wrapper; }
beforeEach(() => {
  vi.clearAllMocks(); state.user = { role: 'admin' };
  api.get.mockImplementation(async url => ({ data: url.endsWith('packet-recipients') ? { recipients: [{ userId: 72, name: 'Authorized Guardian', email: 'guardian@example.test' }] } : url.endsWith('.pdf') ? new Blob(['pdf'], { type: 'application/pdf' }) : catalog() }));
  api.put.mockImplementation(async (_, body) => ({ data: { ...disclosure, html: body.html + '<p>Current Provider, LPC</p>', editableHtml: body.html, version: 4 } }));
  api.post.mockResolvedValue({ data: { sent: true } });
  URL.createObjectURL = vi.fn(() => 'blob:enrollment'); URL.revokeObjectURL = vi.fn();
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks(); });
describe('enrollment source documents and packets', () => {
  it('opens the audience, setting and service supplied by an existing paper-packet link', async () => {
    await render({initialContext:{setting:'school',service:'tutoring',audience:'guardian',locale:'es'},schoolId:40});
    expect(api.get).toHaveBeenCalledWith('/enrollment-foundations',{params:expect.objectContaining({agencyId:2,channel:'tutoring',setting:'school',audience:'guardian',locale:'es',schoolId:40})});
  });
  it('shows live sources and keeps the generated roster outside editable content', async () => {
    await render(); expect(wrapper.text()).toContain('AuricWell'); expect(wrapper.text()).toContain('ITSCO'); expect(wrapper.text()).toContain('Current Provider, LPC');
    await button('Edit source document').trigger('click'); expect(wrapper.get('textarea').element.value).toBe(disclosure.editableHtml); expect(wrapper.get('textarea').element.value).not.toContain('Current Provider');
    await wrapper.get('textarea').setValue('<p>Updated introduction</p>'); await button('Save source document').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/enrollment-foundations/disclosure', { agencyId: 2, channel: 'office', setting: 'office', audience: 'self', packetService: 'counseling', locale: 'en', version: 3, html: '<p>Updated introduction</p>' });
    expect(wrapper.text()).toContain('Current Provider, LPC'); expect(wrapper.text()).toContain('New packets will use this version'); expect(wrapper.emitted('saved')[0][0].version).toBe(4);
  });
  it.each(['provider', 'support', 'staff'])('keeps %s read-only even if malformed catalog says editable', async role => {
    state.user.role = role; await render(); expect(button('Edit source document')).toBeUndefined(); expect(button('Download PDF')).toBeDefined(); expect(button('Share to client portal')).toBeDefined();
  });
  it('requires both server edit permission and an editable source, including for super admins', async () => {
    state.user.role = 'super_admin'; api.get.mockResolvedValueOnce({ data: { ...catalog(), canEdit: false } }); await render(); expect(button('Edit source document')).toBeUndefined();
    await wrapper.vm.refresh(); await flushPromises(); expect(button('Edit source document')).toBeDefined(); await wrapper.findAll('nav button')[1].trigger('click'); expect(button('Edit source document')).toBeUndefined();
  });
  it('downloads all four variants without editing a packet or automatically sending email', async () => {
    await render();
    for (const setting of ['office', 'school']) for (const audience of ['self', 'guardian']) {
      await wrapper.get('[aria-label="Enrollment setting"]').setValue(setting); await flushPromises(); await wrapper.get('[aria-label="Enrollment signer"]').setValue(audience); await flushPromises();
      await button('Download PDF').trigger('click'); await flushPromises();
      expect(api.get).toHaveBeenLastCalledWith('/enrollment-foundations/packet.pdf', { params: { agencyId: 2, channel: setting, audience, service: 'counseling', locale: 'en' }, responseType: 'blob' });
    }
    expect(anchorClick).toHaveBeenCalledTimes(4); expect(api.put).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
  });
  it('uses tutoring sources, preserves packet setting, and includes supplied school context', async () => {
    await render({ schoolId: 41 }); await wrapper.get('[aria-label="Enrollment setting"]').setValue('school'); await flushPromises(); await wrapper.get('[aria-label="Enrollment service"]').setValue('tutoring'); await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/enrollment-foundations', { params: { agencyId: 2, channel: 'tutoring', setting: 'school', audience: 'self', packetService: 'tutoring', schoolId: 41, locale: 'en' } });
    await wrapper.get('[aria-label="Enrollment language"]').setValue('es'); await flushPromises(); await button('Download PDF').trigger('click'); await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/enrollment-foundations/packet.pdf', { params: { agencyId: 2, channel: 'school', schoolId: 41, audience: 'self', service: 'tutoring', locale: 'es' }, responseType: 'blob' });
  });
  it('retains drafts when navigation is declined and preserves conflicts until deliberate reload', async () => {
    await render(); await button('Edit source document').trigger('click'); await wrapper.get('textarea').setValue('<p>Keep my draft</p>'); confirm.mockReturnValue(false);
    await wrapper.get('[aria-label="Enrollment setting"]').setValue('school'); await flushPromises(); expect(wrapper.get('[aria-label="Enrollment setting"]').element.value).toBe('office'); expect(api.get).toHaveBeenCalledTimes(1); expect(wrapper.vm.prepareToLeave()).toBe(false);
    api.put.mockRejectedValueOnce({ response: { status: 409, data: { message: 'Changed elsewhere' } } }); await button('Save source document').trigger('click'); await flushPromises();
    expect(wrapper.get('textarea').element.value).toBe('<p>Keep my draft</p>'); expect(button('Save source document').attributes('disabled')).toBeDefined();
    await button('Reload latest version').trigger('click'); await flushPromises(); expect(api.get).toHaveBeenCalledTimes(1); confirm.mockReturnValue(true); await button('Reload latest version').trigger('click'); await flushPromises(); expect(wrapper.find('textarea').exists()).toBe(false);
  });
  it('preserves edits entered while a prior save is pending and uses the returned version next', async () => {
    await render(); await button('Edit source document').trigger('click'); await wrapper.get('textarea').setValue('<p>First change</p>');
    let finish; api.put.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); await button('Save source document').trigger('click');
    await wrapper.get('textarea').setValue('<p>Newer change</p>'); finish({ data: { ...disclosure, html: '<p>First change</p>', editableHtml: '<p>First change</p>', version: 4 } }); await flushPromises();
    expect(wrapper.get('textarea').element.value).toBe('<p>Newer change</p>'); expect(wrapper.text()).toContain('latest edits still need');
    await button('Save source document').trigger('click'); await flushPromises(); expect(api.put.mock.calls[1][1]).toMatchObject({ version: 4, html: '<p>Newer change</p>' });
  });
  it('filters the source list by library search and updates previews for the selected signer', async () => {
    await render({ search: 'Enrollment form' }); expect(wrapper.findAll('nav button')).toHaveLength(1); expect(wrapper.get('nav').text()).not.toContain('Provider disclosure');
    await wrapper.get('[aria-label="Enrollment signer"]').setValue('guardian'); await flushPromises(); expect(api.get).toHaveBeenLastCalledWith('/enrollment-foundations', { params: { agencyId: 2, channel: 'office', setting: 'office', audience: 'guardian', packetService: 'counseling', locale: 'en' } });
    await wrapper.setProps({ search: 'not a source' }); expect(wrapper.get('nav').text()).toContain('No enrollment documents match');
  });
  it('ignores stale agency responses and shares only the currently selected tenant source', async () => {
    let resolveOld; api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })); wrapper = mount(Enrollment, { props: { agencyId: 2 } });
    api.get.mockResolvedValueOnce({ data: { ...catalog(), agency: { id: 3, name: 'Another agency' }, documents: [{ ...intake, title: 'Their enrollment' }] } }); await wrapper.setProps({ agencyId: 3 }); await flushPromises(); resolveOld({ data: catalog() }); await flushPromises();
    expect(wrapper.text()).toContain('Another agency'); expect(wrapper.text()).not.toContain('Current Provider'); await button('Share to client portal').trigger('click'); expect(wrapper.emitted('share-document')[0][0]).toMatchObject({ agencyId: 3, key: 'enrollment', title: 'Their enrollment' });
  });
  it('sanitizes previews and shares source identity, not an editable client-submitted HTML body', async () => {
    api.get.mockResolvedValueOnce({ data: { ...catalog(), documents: [{ ...disclosure, html: '<script>alert(1)</script><p onclick="evil()">Safe source</p><iframe src="https://bad.test"></iframe>' }] } }); await render();
    expect(wrapper.find('.source-preview script').exists()).toBe(false); expect(wrapper.find('.source-preview iframe').exists()).toBe(false); expect(wrapper.get('.source-preview p').attributes('onclick')).toBeUndefined();
    await button('Share to client portal').trigger('click'); expect(wrapper.emitted('share-document')[0][0]).toEqual({ agencyId: 2, channel: 'office', audience: 'self', service: 'counseling', locale: 'en', key: 'disclosure', title: 'Provider disclosure', version: 3 });
  });
  it('emails a blank packet only on explicit submit and blocks duplicate sends while pending', async () => {
    await render(); await button('Send PDF by email').trigger('click'); await wrapper.get('[aria-label="Client picker"]').setValue('41'); await flushPromises(); await wrapper.get('[aria-label="Packet email recipient"]').setValue('72'); expect(api.post).not.toHaveBeenCalled();
    let finish; api.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); await wrapper.get('form.email-packet').trigger('submit'); await wrapper.get('form.email-packet').trigger('submit');
    expect(api.post).toHaveBeenCalledTimes(1); expect(api.post).toHaveBeenCalledWith('/enrollment-foundations/packet-email', { agencyId: 2, channel: 'office', audience: 'self', service: 'counseling', locale: 'en', clientId: 41, recipientUserId: 72 });
    finish({ data: { sent: true } }); await flushPromises(); expect(wrapper.text()).toContain('Enrollment packet sent.');
  });
  it('uses only authorized recipients for the selected assigned client and clears stale results', async () => {
    await render(); await button('Send PDF by email').trigger('click');
    // The picker is constrained to this agency, including for super administrators.
    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
    let finishOld; api.get.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    await wrapper.get('[aria-label="Client picker"]').setValue('41');
    api.get.mockResolvedValueOnce({ data: { recipients: [{ userId: 73, name: 'Current guardian', email: 'current@example.test' }] } });
    await wrapper.get('[aria-label="Client picker"]').setValue('42'); await flushPromises();
    finishOld({ data: { recipients: [{ userId: 99, name: 'Previous client guardian', email: 'previous@example.test' }] } }); await flushPromises();
    expect(wrapper.text()).not.toContain('Previous client guardian'); expect(wrapper.text()).toContain('Current guardian');
    await wrapper.get('form.email-packet').trigger('submit'); expect(api.post).not.toHaveBeenCalled();
    await wrapper.get('[aria-label="Packet email recipient"]').setValue('73'); await wrapper.get('form.email-packet').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/enrollment-foundations/packet-email', expect.objectContaining({ clientId: 42, recipientUserId: 73 }));
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('to');
  });
  it('reports email/load failures without success or stale source content', async () => {
    await render(); await button('Send PDF by email').trigger('click'); await wrapper.get('[aria-label="Client picker"]').setValue('41'); await flushPromises(); await wrapper.get('[aria-label="Packet email recipient"]').setValue('72'); api.post.mockRejectedValueOnce({ response: { data: { message: 'Configure your forms mailbox first.' } } });
    await wrapper.get('form.email-packet').trigger('submit'); await flushPromises(); expect(wrapper.text()).toContain('Configure your forms mailbox first.'); expect(wrapper.text()).not.toContain('Enrollment packet sent.');
    api.get.mockRejectedValueOnce(new Error('Offline')); await wrapper.vm.refresh(); await flushPromises(); expect(wrapper.find('.source-document').exists()).toBe(false); expect(button('Download PDF').attributes('disabled')).toBeDefined();
    await button('Try again').trigger('click'); await flushPromises(); expect(wrapper.find('.source-document').exists()).toBe(true);
  });
});
