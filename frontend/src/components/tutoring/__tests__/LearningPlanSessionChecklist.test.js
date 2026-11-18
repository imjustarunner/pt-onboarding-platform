import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Checklist from '../LearningPlanSessionChecklist.vue';
import { bundle, planChecklist } from '../../../../previews/learning-session/fixture';
const render = (extra = {}) => mount(Checklist, { props: { bundle, ...extra } });
describe('learning-plan objective checklist', () => {
  it('starts with nothing selected and no assumed performance', () => {
    const wrapper = render();
    expect(wrapper.findAll('input[type=radio]')).toHaveLength(0);
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="Session narrative preview"]').text()).toContain('Select at least one');
  });
  it('hydrates previous results and sends only selected plan areas without generating prose through AI', async () => {
    const wrapper = render({ initialChecklist: planChecklist });
    expect(wrapper.get('[aria-label="Session narrative preview"]').text()).toContain('6 of 8 correct');
    expect(wrapper.get('[aria-label="Session narrative preview"]').text()).not.toContain('Add decimals');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('save')[0][0].planChecklist.areas).toEqual(planChecklist.areas);
  });
  it('requires a rating after selecting an objective and updates the suggestion in place', async () => {
    const wrapper = render(); await wrapper.get('.focus-toggle input').setValue(true);
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    await wrapper.get('input[value="developing"]').setValue(true);
    expect(wrapper.get('.next-step').text()).toContain('Revisit');
    await wrapper.get('input[value="secure"]').setValue(true);
    expect(wrapper.get('.next-step').text()).toContain('Move forward');
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
  });
  it('clears observed strategies and results when switching to not observed', async () => {
    const wrapper = render({ initialChecklist: planChecklist });
    await wrapper.get('input[value="not_observed"]').setValue(true);
    expect(wrapper.find('.strategies').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    const area = wrapper.emitted('save')[0][0].planChecklist.areas[0];
    expect(area).toMatchObject({ rating: 'not_observed', strategyKeys: [], result: '' });
    expect(wrapper.get('.preview').text()).toContain('progress not assessed');
  });
  it('requires explicit review to replace an older manual note', async () => {
    const wrapper = render({ initialChecklist: planChecklist, previousNote: { summary: 'Original text', metadata_json: {} } });
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.previous').text()).toContain('Original text');
    await wrapper.get('.replace input').setValue(true);
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
  });
  it('clears selections when a different plan is opened', async () => {
    const wrapper = render({ initialChecklist: planChecklist });
    await wrapper.setProps({ bundle: { ...bundle, plan: { ...bundle.plan, id: 999 }, goals: [], objectives: [] }, initialChecklist: null });
    expect(wrapper.findAll('.focus')).toHaveLength(0);
    expect(wrapper.get('.preview').text()).not.toContain('6 of 8');
  });
});
