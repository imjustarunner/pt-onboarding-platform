import { shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import Portal from '../CandidatePreHirePortalView.vue';
// Account readiness does not render PDFs; avoid loading PDF.js browser APIs in jsdom.
vi.mock('../../components/prehire/HireDocumentPreview.vue', () => ({ default: { template: '<div />' } }));
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: api }));
vi.mock('axios', () => ({ default: { create: () => api } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { token: 'fixture' }, query: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../composables/useOnboardingActivity.js', () => ({ useOnboardingActivity: () => ({}) }));
let state;
beforeEach(() => {
  state = { candidate: { status: 'ONBOARDING', workEmail: 'staff@example.invalid', passwordFinalized: false, canFinalizeLogin: false }, agency: { name: 'Fixture' }, hireAccountMode: 'group_password', journey: {}, workflow: { supervisor: {} }, tasks: [] };
  api.get.mockImplementation(async url => ({ data: url.includes('suggestions') ? { suggestions: [] } : state }));
});
async function mountAccount() {
  const wrapper = shallowMount(Portal, { global: { stubs: { HirePortalWorkspace: { template: '<div><slot name="account" /></div>' } } } });
  await flushPromises();
  return wrapper;
}
it('explains prerequisites and hides password entry until all required onboarding is ready', async () => {
  const wrapper = await mountAccount();
  expect(wrapper.text()).toContain('Complete all required onboarding steps first');
  expect(wrapper.find('input[autocomplete="new-password"]').exists()).toBe(false);
  wrapper.unmount();
});
it('shows password preparation at the final step without claiming that it activates login', async () => {
  state.candidate.canFinalizeLogin = true;
  const wrapper = await mountAccount();
  expect(wrapper.findAll('input[autocomplete="new-password"]')).toHaveLength(2);
  expect(wrapper.text()).toContain('when People Operations activates');
  wrapper.unmount();
});
it('keeps submitted onboarding read-only while staff activation is pending', async () => {
  state.journey.onboardingCompletedAt = '2026-09-26';
  state.candidate.passwordFinalized = true;
  const wrapper = await mountAccount();
  expect(wrapper.text()).toContain('activate your account after onboarding review');
  expect(wrapper.find('input[autocomplete="new-password"]').exists()).toBe(false);
  wrapper.unmount();
});
