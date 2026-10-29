import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
import { withOfficeReferralSource } from '../../../../backend/src/utils/officeReferralSource.js';
const { get, route } = vi.hoisted(() => ({ get: vi.fn(), route: { params: { publicKey: 'office-test' }, query: {}, path: '/intake/office-test' } }));
vi.mock('../../services/api', () => ({ default: { get, post: vi.fn(), put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div/>' } }));
let wrapper;
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => wrapper?.unmount());
async function render(scope = 'agency', slug = 'itsco') {
  const agency = { id: 2, name: 'ITSCO', slug };
  const link = withOfficeReferralSource({ id: 1, form_type: 'intake', scope_type: scope, organization_id: 2, inherits_office_master: scope === 'agency' ? 1 : 0, master_channel: 'counseling', intake_fields: [], intake_steps: [{ id: 'needs', type: 'questions', label: 'Your needs', fields: [{ key: 'reason', label: 'What brings you here?', type: 'text' }] }] }, agency);
  const data = { link, agency, organization: { ...agency, organization_type: scope === 'school' ? 'school' : 'agency' }, templates: [] };
  get.mockImplementation(async url => ({ data: url === '/public-intake/office-test' ? data : {} }));
  wrapper = mount(PublicIntakeSigningView, { global: { plugins: [createPinia()], stubs: { DigitalFormShell: { template: '<main><slot/></main>' }, SignaturePad: true } } });
  await flushPromises(); wrapper.vm.step = 0.5; await flushPromises();
}
it.each(['self', 'dependent', 'couple', 'family'])('shows one optional shared question for %s office enrollment and restores its answer', async subject => {
  await render(); wrapper.vm.serviceSubject = subject; wrapper.vm.intakeForSelf = subject === 'self'; await flushPromises();
  const groups = wrapper.findAll('.form-group').filter(g => g.text().includes('How did you hear about the agency?'));
  expect(groups).toHaveLength(1);
  const input = groups[0].get('input'); expect(input.attributes('required')).toBeUndefined();
  await input.setValue('FRC Trunk or Treat');
  expect(wrapper.vm.intakeResponses.submission.office_referral_source).toBe('FRC Trunk or Treat');
  wrapper.vm.applyDraftSnapshot({ intakeResponses: { submission: { office_referral_source: 'FRC Trunk or Treat' }, clients: [{}] }, clients: [{ firstName: 'Test', lastName: 'Client' }] });
  await flushPromises(); expect(input.element.value).toBe('FRC Trunk or Treat');
});
it.each([['school', 'itsco'], ['agency', 'another-agency']])('does not add the question to %s / %s', async (scope, slug) => {
  await render(scope, slug); expect(wrapper.text()).not.toContain('How did you hear about the agency?');
});
