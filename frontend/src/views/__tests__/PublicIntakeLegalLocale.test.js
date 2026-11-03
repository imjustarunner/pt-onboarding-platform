import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
import { setPublicLocale } from '../../i18n';

const { get, route } = vi.hoisted(() => ({ get: vi.fn(), route: { params: { publicKey: 'office-legal-test' }, query: {}, path: '/intake/office-legal-test' } }));
vi.mock('../../services/api', () => ({ default: { get, post: vi.fn().mockResolvedValue({ data: {} }), put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div/>' } }));
let wrapper;
const section = (locale, variant = 'self') => ({ sectionKey: 'policy_services', locale, variant, packetVersion: 7, contentHash: `${locale}-${variant}`, title: locale === 'es' ? 'Política y servicios' : 'Policy and services', html: `<p>${locale === 'es' ? 'Acuerdo de servicios' : 'Services agreement'} ${variant}</p>` });
const disclosure = locale => ({ locale, contentHash: `${locale}-disclosure`, providers: [{ id: 9, fullName: 'Demo Provider' }], sections: [{ id: 'intro', html: `<p>${locale === 'es' ? 'Este documento' : 'This document'}</p>` }] });
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); setPublicLocale('en'); window.scrollTo = vi.fn(); route.query = {};
  const agency = { id: 2, name: 'Example Agency', slug: 'test' };
  get.mockReset().mockImplementation(async (url, options) => {
    if (url.endsWith('/packet-section/policy_services')) return { data: section(options.params.locale, options.params.variant) };
    if (url.endsWith('/disclosure-context')) return { data: { disclosureContext: disclosure(options.params.locale) } };
    return { data: url === '/public-intake/office-legal-test' ? {
      link: { id: 1, form_type: 'intake', scope_type: 'agency', organization_id: 2, inherits_office_master: 1, language_code: 'en', master_channel: 'counseling', intake_fields: [], intake_steps: [
        { id: 'policy', type: 'packet_policy_services', label: 'Policy' }, { id: 'disclosure', type: 'smart_disclosure', label: 'Disclosure' }
      ] }, agency, organization: { ...agency, organization_type: 'agency' }, templates: []
    } : {} };
  });
});
afterEach(() => { wrapper?.unmount(); setPublicLocale('en'); });
async function render() {
  wrapper = mount(PublicIntakeSigningView, { global: { plugins: [createPinia()], stubs: { DigitalFormShell: { template: '<main><slot/></main>' }, SignaturePad: true } } });
  await flushPromises();
  expect(wrapper.vm.link).toMatchObject({ inherits_office_master: 1 });
}

it('loads the selected legal language and audience and never reuses another edition', async () => {
  await render();
  expect((await wrapper.vm.ensurePacketSectionContext('policy_services')).html).toContain('Services agreement');
  await wrapper.vm.switchLinkedLanguage('es');
  expect((await wrapper.vm.ensurePacketSectionContext('policy_services'))).toMatchObject({ locale: 'es', html: '<p>Acuerdo de servicios self</p>' });
  wrapper.vm.intakeForSelf = false;
  expect((await wrapper.vm.ensurePacketSectionContext('policy_services'))).toMatchObject({ locale: 'es', variant: 'parent' });
  await wrapper.vm.switchLinkedLanguage('en');
  expect((await wrapper.vm.ensurePacketSectionContext('policy_services'))).toMatchObject({ locale: 'en', variant: 'parent' });
  expect(get.mock.calls.filter(([url]) => url.includes('/packet-section/')).map(([, options]) => options.params)).toEqual([
    { locale: 'en', variant: 'self' }, { locale: 'es', variant: 'self' }, { locale: 'es', variant: 'parent' }, { locale: 'en', variant: 'parent' }
  ]);
});

it('keeps a delayed English response from replacing the selected Spanish agreement', async () => {
  await render();
  let resolveEnglish;
  const original = get.getMockImplementation();
  get.mockImplementation((url, options) => url.endsWith('/packet-section/policy_services') && options.params.locale === 'en'
    ? new Promise(resolve => { resolveEnglish = resolve; }) : original(url, options));
  wrapper.vm.packetSectionContexts = null;
  const pending = wrapper.vm.ensurePacketSectionContext('policy_services');
  await wrapper.vm.switchLinkedLanguage('es');
  await wrapper.vm.ensurePacketSectionContext('policy_services');
  resolveEnglish({ data: section('en') }); await pending;
  expect(wrapper.vm.packetSectionContexts.policy_services.locale).toBe('es');
});

it('loads authored disclosure content in each selected language', async () => {
  await render();
  expect((await wrapper.vm.ensureDisclosureContext()).sections[0].html).toContain('This document');
  await wrapper.vm.switchLinkedLanguage('es');
  expect((await wrapper.vm.ensureDisclosureContext()).sections[0].html).toContain('Este documento');
  await wrapper.vm.switchLinkedLanguage('en');
  expect((await wrapper.vm.ensureDisclosureContext()).locale).toBe('en');
});
