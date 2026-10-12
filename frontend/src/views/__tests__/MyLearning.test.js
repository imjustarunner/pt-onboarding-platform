import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import Learning from '../MyLearningView.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
import api from '../../services/api';
const click = async (w, label) => { await w.findAll('button').find(b => b.text() === label).trigger('click'); await flushPromises(); };
let calls;
beforeEach(() => {
  calls = [];
  api.get.mockImplementation(async path => {
    calls.push(path);
    if (path.includes('/training-focuses') && path.includes('/users/')) return { data: { focuses: [{ id: 7, agencyId: 2, name: 'Completed onboarding', completionPercent: 100, modules: [] }, { id: 8, agencyId: 3, name: 'Other agency course', completionPercent: 100, modules: [] }] } };
    if (path.endsWith('/modules')) return { data: [{ id: 4, title: 'Optional course', description: 'Practice a skill.' }] };
    return { data: [] };
  });
});
async function render(realAssignments = false) {
  const pinia = createPinia(); const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:organizationSlug/my-learning', component: Learning }, { path: '/:organizationSlug/:page', component: { template: '<div />' } }] });
  useAuthStore(pinia).user = { id: 10, role: 'provider' }; useAgencyStore(pinia).currentAgency = { id: 2, slug: 'itsco', name: 'ITSCO' }; useAgencyStore(pinia).userAgencies = [useAgencyStore(pinia).currentAgency];
  await router.push('/itsco/my-learning'); await router.isReady();
  const w = mount(Learning, { global: { plugins: [pinia, router], stubs: { TrainingFocusTab: realAssignments ? false : { template: '<div>Assigned course list</div>' }, OnboardingChecklistView: { template: '<div>Personal onboarding checklist</div>' }, DocumentLearningCatalog: { props: ['mode'], template: '<div :data-mode="mode">Guide learning</div>' } } } });
  await flushPromises(); return { w, router };
}
describe('Plotline learning workspace', () => {
  it('handles the real assigned-focus object response and separates overview, on-demand, onboarding and history', async () => {
    const { w, router } = await render();
    expect(w.text()).toContain('Assigned course list'); expect(w.text()).toContain('Completed onboarding'); expect(w.text()).not.toContain('Other agency course');
    expect(w.text()).toContain('Explore on-demand'); expect(w.find('[aria-label="Plotline by PlotTwistCo"]').exists()).toBe(true);
    await click(w, 'My Onboarding Package →'); expect(router.currentRoute.value.query.learning).toBe('onboarding'); expect(w.text()).toContain('Personal onboarding checklist'); expect(w.text()).not.toContain('Assigned course list'); expect(w.text()).not.toContain('Explore on-demand');
    await click(w, 'On-Demand'); expect(w.find('[data-mode="on-demand"]').exists()).toBe(true); expect(w.text()).toContain('Optional course'); expect(w.text()).not.toContain('Personal onboarding checklist');
    await click(w, 'Completed'); expect(w.find('[data-mode="completed"]').exists()).toBe(true); expect(w.text()).toContain('Completed onboarding'); expect(w.text()).not.toContain('Optional course');
    expect(api.get).toHaveBeenCalledWith('/on-demand-training/modules', { params: { agencyId: 2 } }); w.unmount();
  });
  it('keeps Plotline in a compact training masthead and links out to the document library', async () => {
    const { w } = await render();
    const header = w.find('.training-masthead');
    expect(header.find('h1').text()).toBe('Training center');
    expect(header.text()).toContain('ITSCO');
    expect(header.find('a[href="/itsco/library"]').text()).toBe('Document library');
    expect(header.text()).not.toContain('Library & learning');
    expect(header.text()).not.toContain('Handbooks & guides');
    expect(w.findAll('.onboarding-link')).toHaveLength(1);
    expect(w.findAll('.learning-summary strong').map(n => n.text())).toEqual(['0', '0', '1']);
    w.unmount();
  });
  it('uses saved progress without guessing a percentage from in-progress status', async () => {
    const previous = api.get.getMockImplementation();
    api.get.mockImplementation(async path => path === '/progress' ? { data: [{ module_id: 4, status: 'in_progress' }] } : previous(path));
    const { w } = await render();
    expect(w.findAll('.learning-summary strong').map(n => n.text())).toEqual(['0', '1', '1']);
    await click(w, 'On-Demand');
    const course = w.findAll('.course-card').find(c => c.text().includes('Optional course'));
    expect(course.text()).toContain('In progress');
    expect(course.text()).toContain('Continue');
    expect(course.find('progress').exists()).toBe(false);
    w.unmount();
  });
  it('searches assigned training and recommendations from the same field', async () => {
    const { w } = await render(true);
    expect(w.find('.training-focus-tab').text()).toContain('Completed onboarding');
    await w.find('input[type="search"]').setValue('Nothing matching this query');
    expect(w.find('.training-focus-tab').text()).toContain('No assigned training matches your search');
    expect(w.find('.on-demand-preview').exists()).toBe(false);
    await w.find('input[type="search"]').setValue('onboarding');
    expect(w.find('.training-focus-tab').text()).toContain('Completed onboarding');
    w.unmount();
  });
  it('renders an empty response without a blank screen', async () => {
    api.get.mockResolvedValue({ data: {} }); const { w } = await render();
    expect(w.text()).toContain('My Training'); await click(w, 'Completed'); expect(w.text()).toContain('Your completed courses will appear here'); w.unmount();
  });
});
