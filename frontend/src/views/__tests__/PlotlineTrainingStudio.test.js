import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import Studio from '../admin/PlotlineTrainingStudioView.vue';
import Builder from '../admin/CourseBuilderView.vue';
import { plotlinePaths } from '../../utils/plotline.js';

const state = vi.hoisted(() => ({ route: null, get: vi.fn(), post: vi.fn(), put: vi.fn(), push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => state.route, useRouter: () => ({ push: state.push }),
  onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn()
}));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({
  currentAgency: { id: 463, slug: 'juniper-qa', feature_flags: { plotlineOnly: true } }
}) }));
vi.mock('../../services/api', () => ({ default: { get: state.get, post: state.post, put: state.put } }));
vi.mock('../../components/admin/courseBuilder/LessonBlockCanvasItem.vue', () => ({
  default: { props: ['block'], template: '<div>{{ block.title }}</div>' }
}));
vi.mock('../../components/admin/courseBuilder/MediaLibraryPanel.vue', () => ({
  default: { template: '<div>Media</div>' }
}));
const model = { id: 91, agency_id: 463, title: 'First day', publish_status: 'draft', is_active: 0, version: 1 };
let view;
beforeEach(() => {
  vi.resetAllMocks();
  state.route = reactive({ params: { organizationSlug: 'juniper-qa', id: 91 }, query: {} });
});
afterEach(() => view?.unmount());
const button = text => view.findAll('button').find(element => element.text() === text);

it('keeps another company out of the catalog and opens the chosen starter as a company draft', async () => {
  state.get.mockResolvedValue({ data: [model, { ...model, id: 700, agency_id: 464, title: 'Private company B' }] });
  state.post.mockResolvedValue({ data: model });
  view = mount(Studio, { global: { stubs: { RouterLink: true } } });
  await flushPromises();
  expect(view.text()).not.toContain('Private company B');
  await button('New lesson').trigger('click');
  await view.get('input[maxlength="255"]').setValue('On your first day');
  await view.get('input[type="radio"][value="welcome"]').setValue(true);
  await view.get('form').trigger('submit');
  await flushPromises();
  expect(state.post).toHaveBeenCalledWith('/modules', expect.objectContaining({ agencyId: 463, isActive: false, publishStatus: 'draft' }));
  expect(state.push).toHaveBeenCalledWith({ path: '/juniper-qa/admin/modules/91/builder', query: { starter: 'welcome' } });
});

it('shows unsaved edits in preview and sends one atomic publish request only after confirmation', async () => {
  const blocks = [{ id: 9, content_type: 'text', title: 'Intro', content_data: { content: '<p>Welcome to the team</p>' }, settings: {} }];
  state.get.mockResolvedValue({ data: { module: model, blocks, revision: 'opened' } });
  state.put.mockResolvedValue({ data: { module: { ...model, publish_status: 'published', is_active: 1 }, blocks, revision: 'published' } });
  view = mount(Builder, { global: { stubs: { RouterLink: true } } });
  await flushPromises();
  await button('Settings').trigger('click');
  await view.get('#lesson-title').setValue('Your first morning');
  await button('Learner preview').trigger('click');
  expect(view.get('.preview-lesson').text()).toContain('Your first morning');
  expect(view.get('.preview-lesson').text()).toContain('Welcome to the team');
  expect(state.put).not.toHaveBeenCalled();
  await button('Publish').trigger('click');
  expect(state.put).not.toHaveBeenCalled();
  await button('Confirm publication').trigger('click');
  await flushPromises();
  expect(state.put).toHaveBeenCalledWith('/modules/91/studio', expect.objectContaining({
    title: 'Your first morning', revision: 'opened', publish: true,
    blocks: [expect.objectContaining({ id: 9, contentType: 'text' })]
  }), { headers: { 'X-Agency-Id': '463' } });
  expect(view.get('.status-badge').text()).toBe('Published');
});

it('round trips the handbook through the company URL', () => {
  expect(plotlinePaths.clean('/juniper-qa/workplace-handbook')).toBe('/app/juniper-qa/workplace-handbook');
  expect(plotlinePaths.internal('/app/juniper-qa/workplace-handbook')).toBe('/juniper-qa/workplace-handbook');
});
