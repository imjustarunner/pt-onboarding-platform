// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: http }));
vi.mock('axios', () => ({ default: { create: () => http } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { token: 'test-token' } }), useRouter: () => ({ push: vi.fn() }) }));
import CandidatePreHirePortal from '../CandidatePreHirePortalView.vue';
import { isOnboardingActive } from '../../composables/useOnboardingActivity.js';
let wrapper;
const state = () => ({ candidate: { firstName: 'Elena', lastName: 'Cruz', status: 'ONBOARDING', workEmail: 'elena@example.org' },
  agency: { name: 'ITSCO' }, portalPhase: 'onboarding', progress: { total: 1, completed: 0, percent: 0, allDone: false },
  tasks: [{ id: 2, title: 'Profile questionnaire', taskType: 'training', referenceId: 4, status: 'pending', isRequired: true }],
  prehireTasks: [{ id: 1, title: 'Signed employment contract', taskType: 'document', status: 'completed' }],
  journey: { prehireCompletedAt: '2026-09-10', time: { seconds: 60 } }, backgroundCheck: { signed: true }, jdAcknowledged: true
});
beforeEach(() => { vi.clearAllMocks(); http.post.mockResolvedValue({ data: { tracking: true } }); });
afterEach(() => { wrapper?.unmount(); });
const open = async (data) => {
  http.get.mockImplementation(async (url) => ({ data: url.endsWith('/submissions')
    ? { completedDocuments: [{ id: 1, title: 'Signed employment contract' }] }
    : url.endsWith('/tasks/1') ? { document: { htmlContent: '<p>Retained agreement</p>' }, status: 'completed' } : data }));
  wrapper = mount(CandidatePreHirePortal, { global: { stubs: { PreHirePortalChat: true, AdaptiveSignatureCapture: true, JobDescriptionSections: true } } });
  await flushPromises(); return wrapper;
};
describe('candidate process interface', () => {
  it('starts onboarding with its own progress and retained prehire switch', async () => {
    await open(state());
    expect(wrapper.find('.journey-switch .selected').text()).toContain('2. Onboarding');
    expect(wrapper.text()).toContain('Completed · view package');
    await wrapper.find('.journey-switch button').trigger('click');
    expect(wrapper.text()).toContain('Your pre-hire package is closed');
  });
  it('keeps the final submit action available after required tasks finish', async () => {
    const data = state(); data.tasks[0].status = 'completed'; data.progress = { total: 1, completed: 1, percent: 100, allDone: true };
    await open(data);
    const tasksLink = wrapper.findAll('a').find((a) => a.text().includes('My Tasks'));
    await tasksLink.trigger('click');
    expect(wrapper.find('.btn-complete').exists()).toBe(true);
    expect(wrapper.find('.btn-complete').attributes('disabled')).toBeUndefined();
  });
  it('opens a completed document from the prior phase', async () => {
    await open(state());
    await wrapper.findAll('a').find((a) => a.text().includes('My Submissions')).trigger('click');
    await flushPromises();
    await wrapper.find('.portal-doc-title-btn').trigger('click'); await flushPromises();
    expect(wrapper.find('.task-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('Retained agreement');
  });
  it('presents submitted onboarding as waiting for staff activation', async () => {
    const data = state(); data.journey.onboardingCompletedAt = '2026-09-11'; data.portalPhase = 'onboarding_review';
    await open(data); expect(wrapper.text()).toContain('People Operations will review your package and mark you active');
  });
});
describe('activity attention signals', () => {
  const base = { visible: true, focused: true, lastInputAt: 0, now: 1000 };
  it('counts active reading', () => expect(isOnboardingActive(base)).toBe(true));
  it('pauses after two minutes without activity', () => expect(isOnboardingActive({ ...base, now: 120000 })).toBe(false));
  it('keeps active video playback countable', () => expect(isOnboardingActive({ ...base, now: 200000, playingVideo: true })).toBe(true));
  it('does not count hidden video or background tabs', () => expect(isOnboardingActive({ ...base, visible: false, playingVideo: true })).toBe(false));
  it('does not count an unfocused window', () => expect(isOnboardingActive({ ...base, focused: false })).toBe(false));
});
