import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get, post, put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { publicKey: 'pending-finalize' }, query: {}, path: '/intake/pending-finalize' }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() })
}));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div />' } }));

let wrapper;
let complete;
let fail;
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  const data = {
    link: { id: 1, form_type: 'intake', scope_type: 'agency', organization_id: 2, agency_id: 1,
      inherits_office_master: 1, master_channel: 'counseling', intake_fields: [],
      intake_steps: [{ id: 'review', type: 'questions', fields: [] }] },
    organization: { id: 2, name: 'QA Organization', organization_type: 'agency' },
    agency: { id: 1, name: 'QA Agency' }, templates: []
  };
  get.mockReset().mockImplementation(async url => ({ data: url === '/public-intake/pending-finalize' ? data : {} }));
  post.mockReset().mockImplementation(url => url.endsWith('/finalize')
    ? new Promise((resolve, reject) => { complete = resolve; fail = reject; })
    : Promise.resolve({ data: {} }));
  wrapper = mount(PublicIntakeSigningView, { global: {
    plugins: [createPinia()],
    stubs: { DigitalFormShell: { template: '<main><slot /></main>' }, SignaturePad: true, SecureCardSetup: true }
  } });
  await flushPromises();
  wrapper.vm.intakeForSelf = true;
  wrapper.vm.serviceSubject = 'self';
  wrapper.vm.sessionToken = 'qa-session';
  wrapper.vm.submissionId = 991;
  wrapper.vm.signatureData = 'qa-saved-signature';
  wrapper.vm.step = 2;
  wrapper.vm.currentFlowIndex = 0;
  await flushPromises();
});
afterEach(() => wrapper?.unmount());

function expectNoReceipt() {
  expect(wrapper.text()).not.toContain('submitted successfully');
  expect(wrapper.text()).not.toContain('Download PDF');
  expect(wrapper.text()).not.toContain('Reference number: 991');
}

describe('final enrollment save', () => {
  it('keeps the signed form visible until the server accepts the enrollment', async () => {
    const saving = wrapper.vm.finalizePacket();
    await flushPromises();
    expect(wrapper.vm.step).toBe(2);
    expectNoReceipt();
    complete({ data: { submissionId: 991, downloadUrl: '/api/qa-completed-packet.pdf' } });
    await saving;
    await flushPromises();
    expect(wrapper.vm.step).toBe(3);
    expect(wrapper.text()).toContain('submitted successfully');
    expect(wrapper.text()).toContain('Reference number: 991');
  });

  it('preserves the signature and stays on the form after a rejected save', async () => {
    const saving = wrapper.vm.finalizePacket();
    await flushPromises();
    expectNoReceipt();
    fail({ response: { status: 400, data: { error: { message: 'Use a unique QA family email.' } } } });
    await saving;
    await flushPromises();
    expect(wrapper.vm.step).toBe(2);
    expect(wrapper.vm.signatureData).toBe('qa-saved-signature');
    expect(wrapper.text()).toContain('Use a unique QA family email.');
    expectNoReceipt();
  });

  it('prevents a second submission and in-form navigation while saving', async () => {
    const saving = wrapper.vm.finalizePacket();
    await flushPromises();
    const repeated = wrapper.vm.finalizePacket();
    wrapper.vm.goBackPublicPage();
    await flushPromises();
    expect(post.mock.calls.filter(([url]) => url.endsWith('/finalize'))).toHaveLength(1);
    expect(wrapper.vm.step).toBe(2);
    complete({ data: { submissionId: 991, downloadUrl: '/api/qa-completed-packet.pdf' } });
    await Promise.all([saving, repeated]);
  });
});
