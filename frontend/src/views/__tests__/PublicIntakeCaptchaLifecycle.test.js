// @vitest-environment-options {"url":"https://app.itsco.health/"}
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
import { setPublicLocale } from '../../i18n';

const { get, post, route } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(),
  route: { params: { publicKey: 'office-captcha-test' }, query: {}, path: '/intake/office-captcha-test' }
}));
vi.mock('../../services/api', () => ({ default: { get, post, put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div/>' } }));

let wrapper, callbacks, renderWidget, ready;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); setPublicLocale('en'); route.query = {};
  window.scrollTo = vi.fn(); callbacks = [];
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(304);
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function () { return this.parentElement; });
  renderWidget = vi.fn((host, options) => {
    callbacks.push(options);
    const frame = document.createElement('iframe'); frame.title = 'reCAPTCHA'; host.appendChild(frame);
    return callbacks.length - 1;
  });
  ready = vi.fn(callback => callback());
  window.grecaptcha = { render: renderWidget, ready, reset: vi.fn() };
  post.mockReset().mockResolvedValue({ data: {} });
});
afterEach(() => {
  wrapper?.unmount(); document.body.innerHTML = ''; delete window.grecaptcha;
  vi.restoreAllMocks(); setPublicLocale('en');
});

async function render({ language = 'en', captcha = false, publishedMaster = false, realShell = false } = {}) {
  const agency = { id: 2, name: 'Example Agency', slug: 'test' };
  const data = {
    link: { id: 1, form_type: 'intake', scope_type: 'agency', organization_id: 2,
      inherits_office_master: 1, language_code: language, master_channel: 'counseling',
      has_spanish_master: publishedMaster, master_language_code: language,
      intake_fields: [], intake_steps: [{ id: 'questions', type: 'questions', label: 'Questions', fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }] }] },
    agency, organization: { ...agency, organization_type: 'agency' }, templates: [],
    recaptcha: captcha ? { siteKey: 'test-public-site-key', forceWidget: true } : {}
  };
  get.mockReset().mockImplementation(async url => ({ data: url === '/public-intake/office-captcha-test' ? data : {} }));
  wrapper = mount(PublicIntakeSigningView, { attachTo: document.body, global: {
    plugins: [createPinia()], stubs: { ...(!realShell && { DigitalFormShell: { template: '<main><slot/></main>' } }), SignaturePad: true }
  } });
  await flushPromises();
  wrapper.vm.step = 0.5;
  if (captcha) {
    wrapper.vm.recaptchaSiteKey = 'test-public-site-key';
    wrapper.vm.recaptchaForceWidget = true;
  }
  await flushPromises();
  if (captcha) await vi.waitFor(() => expect(wrapper.find('#recaptcha-widget-start iframe').exists()).toBe(true), { timeout: 2000 });
}

it('honors the welcome-page Spanish query on initial load and reload without changing answers', async () => {
  route.query = { lang: 'es' };
  await render({ language: 'en' });
  expect(wrapper.vm.intakeLocale).toBe('es');
  expect(get.mock.calls.find(([url]) => url === '/public-intake/office-captcha-test')[1].params.locale).toBe('es');
  wrapper.vm.guardianFirstName = 'Demo';
  await wrapper.vm.loadLink(); await flushPromises();
  expect(wrapper.vm.intakeLocale).toBe('es');
  expect(wrapper.vm.guardianFirstName).toBe('Demo');
  expect(localStorage.getItem('preferredFormLanguage')).toBe('es');
});

it.each([['en', 'es'], ['es', 'en']])('keeps an explicit %s direct link ahead of stale %s browser language', async (language, stored) => {
  setPublicLocale(stored);
  await render({ language });
  expect(wrapper.vm.intakeLocale).toBe(language);
  expect(get.mock.calls.find(([url]) => url === '/public-intake/office-captcha-test')[1].params.locale).toBeUndefined();
});

it('keeps a visible solved widget usable across English and Spanish switches', async () => {
  await render({ captcha: true });
  callbacks[0].callback('verified-token');
  await wrapper.vm.switchLinkedLanguage('es'); await flushPromises();
  await new Promise(resolve => setTimeout(resolve, 300));
  expect(wrapper.find('#recaptcha-widget-start iframe').exists()).toBe(true);
  expect(wrapper.vm.captchaToken).toBe('verified-token');
  expect(renderWidget).toHaveBeenCalledTimes(1);
  await wrapper.vm.switchLinkedLanguage('en'); await flushPromises();
  await new Promise(resolve => setTimeout(resolve, 300));
  expect(wrapper.find('#recaptcha-widget-start iframe').exists()).toBe(true);
  expect(wrapper.vm.captchaToken).toBe('verified-token');
  expect(renderWidget).toHaveBeenCalledTimes(1);
});

it('keeps the same verified widget through a published-master reload in the real shell', async () => {
  await render({ captcha: true, publishedMaster: true, realShell: true });
  const host = wrapper.get('#recaptcha-widget-start').element;
  callbacks[0].callback('verified-master-token');
  wrapper.vm.guardianFirstName = 'Demo';
  for (const language of ['es', 'en']) {
    await wrapper.get(`button[aria-label="${language === 'es' ? 'Español' : 'English'}"]`).trigger('click');
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(wrapper.get('#recaptcha-widget-start').element).toBe(host);
    expect(wrapper.vm.captchaToken).toBe('verified-master-token');
    expect(wrapper.vm.guardianFirstName).toBe('Demo');
    expect(renderWidget).toHaveBeenCalledTimes(1);
  }
  callbacks[0]['expired-callback']();
  expect(wrapper.vm.captchaToken).toBe('');
  await wrapper.vm.switchLinkedLanguage('es'); await flushPromises();
  expect(wrapper.vm.captchaToken).toBe('');
});

it('renders a replacement host and ignores callbacks from the discarded widget', async () => {
  await render({ captcha: true });
  const oldCallback = callbacks[0].callback;
  oldCallback('old-verified-token');
  await flushPromises();
  const oldHost = wrapper.get('#recaptcha-widget-start').element;
  wrapper.vm.recaptchaForceWidget = false;
  await flushPromises();
  expect(oldHost.isConnected).toBe(false);
  wrapper.vm.recaptchaForceWidget = true;
  await flushPromises();
  const replacement = wrapper.get('#recaptcha-widget-start').element;
  expect(replacement).not.toBe(oldHost);
  expect(wrapper.vm.captchaToken).toBe('');
  await vi.waitFor(() => expect(replacement.querySelector('iframe')).not.toBeNull(), { timeout: 2000 });
  expect(renderWidget).toHaveBeenCalledTimes(2);
  oldCallback('late-obsolete-token');
  expect(wrapper.vm.captchaToken).toBe('');
  callbacks[1].callback('new-verified-token');
  expect(wrapper.vm.captchaToken).toBe('new-verified-token');
});

it('recovers a blank existing host when the language changes', async () => {
  await render({ captcha: true });
  const host = wrapper.get('#recaptcha-widget-start').element;
  host.replaceChildren();
  await wrapper.vm.switchLinkedLanguage('es'); await flushPromises();
  await vi.waitFor(() => expect(host.querySelector('iframe')).not.toBeNull(), { timeout: 2000 });
  expect(renderWidget).toHaveBeenCalledTimes(2);
  expect(wrapper.vm.captchaWidgetFailed).toBe(false);
});

it('rechecks the current host when it is replaced during initialization', async () => {
  await render();
  let releaseFirst;
  ready.mockImplementationOnce(callback => { releaseFirst = callback; });
  wrapper.vm.recaptchaSiteKey = 'test-public-site-key';
  wrapper.vm.recaptchaForceWidget = true;
  await flushPromises();
  await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'), { timeout: 2000 });
  wrapper.vm.recaptchaForceWidget = false; await flushPromises();
  wrapper.vm.recaptchaForceWidget = true; await flushPromises();
  releaseFirst();
  await vi.waitFor(() => expect(wrapper.find('#recaptcha-widget-start iframe').exists()).toBe(true), { timeout: 2000 });
  expect(renderWidget).toHaveBeenCalledTimes(1);
  expect(wrapper.vm.captchaWidgetFailed).toBe(false);
});

it('translates an expired CAPTCHA error both ways without remounting the widget', async () => {
  await render({ captcha: true });
  callbacks[0]['expired-callback'](); await flushPromises();
  expect(wrapper.text()).toContain('Complete the verification to continue.');
  await wrapper.vm.switchLinkedLanguage('es'); await flushPromises();
  expect(wrapper.get('.captcha-block .error').text()).toBe('Complete la verificación para continuar.');
  await wrapper.vm.switchLinkedLanguage('en'); await flushPromises();
  expect(wrapper.get('.captcha-block .error').text()).toBe('Complete the verification to continue.');
  expect(renderWidget).toHaveBeenCalledTimes(1);
});
