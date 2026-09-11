import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Designer from '../JoinPageDesigner.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { patch: vi.fn(), post: vi.fn() } }));
const quick = { title: 'Interest form', cta: 'Start interest', bullets: ['One', 'Two'] };
const full = { title: 'Enrollment', cta: 'Start enrollment', enabled: true, bullets: [] };
const config = () => ({ agency: { name: 'Test Clinic', slug: 'test-clinic' }, copy: { welcomeTitle: 'Welcome', welcomeGlad: 'Hello', welcomeLead: 'Introduction', customOption: 'preserve' }, branding: {}, supportContact: {} });
const mountDesigner = () => mount(Designer, { props: { config: config(), agencySlug: 'test-clinic', serviceType: 'tutoring', quick, full }, global: { stubs: { Teleport: true, PublicLinkImageEditor: true } } });
const button = (wrapper, text) => wrapper.findAll('button').find(b => b.text() === text);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  api.patch.mockImplementation(async (url, body) => ({ data: { copy: body.copy } }));
});
afterEach(() => vi.unstubAllGlobals());
describe('Join designer', () => {
  it('saves mobile-only content to the right tenant and service without changing shared content', async () => {
    const wrapper = mountDesigner();
    await button(wrapper, 'Mobile').trigger('click');
    await wrapper.findAll('input[type=checkbox]').find(i => i.element.parentElement.textContent.includes('mobile-only text')).setValue(true);
    await wrapper.find('textarea').setValue('A compact mobile heading');
    await button(wrapper, 'Save changes').trigger('click'); await flushPromises();
    expect(api.patch).toHaveBeenCalledOnce();
    const [url, body] = api.patch.mock.calls[0];
    expect(url).toBe('/public/adaptive-intake/test-clinic/landing'); expect(body.serviceType).toBe('tutoring');
    expect(body.copy.welcomeTitle).toBe('Welcome');
    expect(body.copy.layout.design.views.mobile.copy.welcomeTitle).toBe('A compact mobile heading');
    expect(body.copy.layout.design.views.desktop.copy).toEqual({});
    expect(body.copy.customOption).toBe('preserve');
    expect(wrapper.emitted('saved')).toHaveLength(1); wrapper.unmount();
  });
  it('undoes and redoes a text edit and asks before discarding unsaved changes', async () => {
    const wrapper = mountDesigner();
    await wrapper.find('textarea').setValue('Changed');
    await button(wrapper, 'Undo').trigger('click'); expect(wrapper.find('textarea').element.value).toBe('Welcome');
    await button(wrapper, 'Redo').trigger('click'); expect(wrapper.find('textarea').element.value).toBe('Changed');
    await button(wrapper, 'Close').trigger('click'); expect(wrapper.text()).toContain('You have unsaved changes.');
    expect(wrapper.emitted('close')).toBeUndefined();
    await button(wrapper, 'Discard changes').trigger('click'); expect(wrapper.emitted('close')).toHaveLength(1); wrapper.unmount();
  });
  it('adds, edits, saves, and removes a real text element', async () => {
    const wrapper = mountDesigner();
    await button(wrapper, 'Add').trigger('click');
    const areas = wrapper.findAll('textarea');
    await areas[0].setValue('Our approach'); await areas[1].setValue('A real description.');
    await button(wrapper, 'Save changes').trigger('click'); await flushPromises();
    const copy = api.patch.mock.calls[0][1].copy;
    const custom = copy.layout.design.elements[0];
    expect(custom.type).toBe('text'); expect(copy[custom.id + 'Title']).toBe('Our approach');
    await button(wrapper, 'Remove element').trigger('click');
    await button(wrapper, 'Save changes').trigger('click'); await flushPromises();
    expect(api.patch.mock.calls[1][1].copy.layout.design.elements).toEqual([]); wrapper.unmount();
  });
  it('preserves edits after a failed save and permits retry', async () => {
    api.patch.mockRejectedValueOnce(new Error('Connection lost'));
    const wrapper = mountDesigner(); await wrapper.find('textarea').setValue('Keep this heading');
    await button(wrapper, 'Save changes').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Connection lost'); expect(wrapper.find('textarea').element.value).toBe('Keep this heading');
    expect(wrapper.emitted('saved')).toBeUndefined();
    await button(wrapper, 'Save changes').trigger('click'); await flushPromises(); expect(wrapper.emitted('saved')).toHaveLength(1); wrapper.unmount();
  });
});
