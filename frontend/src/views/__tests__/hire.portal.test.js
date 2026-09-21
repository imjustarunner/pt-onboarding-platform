// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), defaults: { baseURL: '/api' } }));
vi.mock('../../services/api', () => ({ default: http }));
vi.mock('axios', () => ({ default: { create: () => http } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { token: 'test-token' } }), useRouter: () => ({ push: vi.fn() }) }));
import CandidatePreHirePortal from '../CandidatePreHirePortalView.vue';
import { isOnboardingActive, useOnboardingActivity } from '../../composables/useOnboardingActivity.js';
let wrapper;
const state = () => ({ candidate: { firstName: 'Elena', lastName: 'Cruz', status: 'ONBOARDING', workEmail: 'elena@example.org' },
  agency: { name: 'ITSCO' }, portalPhase: 'onboarding', progress: { total: 1, completed: 0, percent: 0, allDone: false },
  tasks: [{ id: 2, title: 'Profile questionnaire', taskType: 'training', referenceId: 4, status: 'pending', isRequired: true }],
  workflow: { config: {}, steps: { pre_hire: [{ key: 'task-1', kind: 'task', title: 'Signed employment contract', complete: true, task: { id: 1, title: 'Signed employment contract', taskType: 'document', status: 'completed' } }], onboarding: [{ key: 'task-2', kind: 'task', title: 'Profile questionnaire', task: { id: 2, taskType: 'training', referenceId: 4 } }, { key: 'review', kind: 'review', title: 'Final review' }] }, progress: { pre_hire: { total: 1, completed: 1, percent: 100, allDone: true }, onboarding: { total: 1, completed: 0, percent: 0, allDone: false } } },
  prehireTasks: [{ id: 1, title: 'Signed employment contract', taskType: 'document', status: 'completed' }],
  journey: { prehireCompletedAt: '2026-09-10', time: { seconds: 60 } }, backgroundCheck: { signed: true }, jdAcknowledged: true
});
beforeEach(() => { vi.clearAllMocks(); http.post.mockResolvedValue({ data: { tracking: true } }); });
afterEach(() => { wrapper?.unmount(); });
const open = async (data) => {
  http.get.mockImplementation(async (url) => ({ data: url.endsWith('/submissions')
    ? { completedDocuments: [{ id: 1, title: 'Signed employment contract' }] }
    : url.endsWith('/tasks/1') ? { document: { htmlContent: '<p>Retained agreement</p>' }, status: 'completed' } : data }));
  wrapper = mount(CandidatePreHirePortal, { global: { stubs: { PreHirePortalChat: true, AdaptiveSignatureCapture: true, JobDescriptionSections: true, HireDocumentPreview: true } } });
  await flushPromises(); return wrapper;
};
describe('candidate process interface', () => {
  it('sends the pause after an in-flight activity request when leaving onboarding', async () => {
    const enabled = ref(true);
    let finish;
    const transport = { post: vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ data: { tracking: false } }) };
    wrapper = mount({ setup() { useOnboardingActivity({ enabled, token: ref('test-token'), http: transport }); return {}; }, template: '<div />' });
    enabled.value = false;
    await nextTick();
    finish({ data: { tracking: true } });
    await flushPromises();
    expect(transport.post).toHaveBeenCalledTimes(2);
    expect(transport.post.mock.calls[1][1]).toMatchObject({ active: false, sequence: 2 });
  });
  it('renders the job description content and acknowledgement inside the step', async () => {
    const data = state(); data.candidate.status = 'PREHIRE_OPEN'; data.journey = {}; data.jdAcknowledged = false;
    data.jobDescription = { title: 'Counselor', descriptionText: 'Provide compassionate care in schools.' };
    data.workflow.steps.pre_hire = [{ key: 'job-description', kind: 'job-description', title: 'Your job description' }];
    await open(data);
    await wrapper.find('.hire-nav nav').findAll('button').find(b => b.text().includes('Pre-Hire')).trigger('click');
    expect(wrapper.find('.portal-jd-content').text()).toContain('Provide compassionate care in schools.');
    expect(wrapper.find('.portal-jd-content').text()).toContain('I acknowledge this job description');
    expect(wrapper.find('.portal-jd-content template').exists()).toBe(false);
  });
  it('lets the candidate download and acknowledge receipt without a signature', async () => {
    const data=state();data.candidate.status='PREHIRE_OPEN';data.journey={};
    const doc={id:'notice',title:'Workplace notice',kind:'receipt',filePath:'notice.pdf',mimeType:'application/pdf'};
    data.workflow.steps.pre_hire=[{key:'doc-notice',kind:'document',title:doc.title,doc}];
    await open(data);
    await wrapper.find('.hire-nav nav').findAll('button').find(b=>b.text().includes('Pre-Hire')).trigger('click');
    const ack=()=>wrapper.findAll('button').find(b=>b.text()==='Acknowledge receipt');
    expect(ack().attributes('disabled')).toBeDefined();
    expect(wrapper.find('adaptive-signature-capture-stub').exists()).toBe(false);
    expect(wrapper.findAll('a').find(a=>a.text()==='Download document').attributes('href')).toContain('/documents/notice/file?download=1');
    await wrapper.get('.portal-doc-row input[type="checkbox"]').setValue(true);
    await ack().trigger('click');await flushPromises();
    expect(http.post).toHaveBeenCalledWith('/prehire-portal/test-token/documents/notice/receipt',{acknowledged:true});
    expect(wrapper.text()).toContain('Receipt acknowledged.');
  });
  it('opens only prehire navigation before staff starts onboarding', async () => {
    const data = state(); data.candidate.status = 'PREHIRE_OPEN'; data.journey = {};
    await open(data);
    const nav = wrapper.find('.hire-nav nav');
    expect(nav.text()).toContain('Pre-Hire');
    expect(nav.text()).not.toContain('Onboarding');
    expect(nav.text()).not.toContain('Active');
  });
  it('starts onboarding with a link back to completed prehire', async () => {
    await open(state());
    const nav = wrapper.find('.hire-nav nav');
    expect(nav.text()).toContain('Onboarding');
    await nav.findAll('button').find(b => b.text().includes('Pre-Hire')).trigger('click');
    expect(wrapper.text()).toContain('Pre-hire complete');
    expect(wrapper.text()).toContain('Retained package');
    expect(wrapper.find('.archive-link').text()).toContain('Return to onboarding');
  });
  it('requires the final certification before offering submission', async () => {
    const data = state(); data.workflow.progress.onboarding = { total: 1, completed: 1, percent: 100, allDone: true };
    await open(data);
    await wrapper.find('.hire-nav nav').findAll('button').find(b => b.text() === 'Onboarding').trigger('click');
    await wrapper.findAll('.steps button').find(b => b.text().includes('Final review')).trigger('click');
    const submit = () => wrapper.findAll('button').find(b => b.text().includes('Submit onboarding for review'));
    expect(submit().attributes('disabled')).toBeDefined();
    await wrapper.find('input[type=checkbox]').setValue(true);
    expect(submit().attributes('disabled')).toBeUndefined();
    await submit().trigger('click');
    expect(wrapper.find('.confirm-modal').exists()).toBe(true);
  });
  it('opens a retained PDF from My Documents', async () => {
    await open(state());
    await wrapper.find('.hire-nav nav').findAll('button').find(b => b.text() === 'My Documents').trigger('click');
    await flushPromises();
    await wrapper.find('.portal-doc-title-btn').trigger('click'); await flushPromises();
    expect(wrapper.find('.task-panel').exists()).toBe(true);
    expect(wrapper.find('hire-document-preview-stub').attributes('url')).toBe('/prehire-portal/test-token/tasks/1/preview');
  });
  it('presents submitted onboarding as waiting for staff activation', async () => {
    const data = state(); data.journey.onboardingCompletedAt = '2026-09-11'; data.portalPhase = 'onboarding_review';
    await open(data); expect(wrapper.text()).toContain('Staff will activate your account after review');
    expect(wrapper.findAll('button').some(b => b.text().includes('Submit onboarding'))).toBe(false);
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
