import { it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Ratings from '../NoteAidObjectiveRatings.vue';
import { priorObjectiveRating, buildObjectiveRatingsContextText } from '../../../utils/noteAidTreatmentHelpers.js';
const history = [
  { id: 1, objective_id: 11, date_of_service: '2026-08-01', rated_at: '2026-09-25', scale_value: 8 },
  { id: 2, objective_id: 11, date_of_service: '2026-09-01', rated_at: '2026-09-02', scale_value: 4 },
  { id: 3, objective_id: 11, date_of_service: '2026-09-27', scale_value: 1 },
  { id: 4, objective_id: 11, date_of_service: '2026-09-15', scale_value: 9 },
  { id: 5, objective_id: 11, date_of_service: '2026-09-14', scale_value: 9, rater_kind: 'client' }
];
it('chooses the earlier service date, excluding future/same-day and different raters', () => {
  expect(priorObjectiveRating(history, { objectiveId: 11, dateOfService: '2026-09-15' }).id).toBe(2);
  expect(priorObjectiveRating(history, { objectiveId: 11, dateOfService: '2026-07-15' })).toBeNull();
  expect(priorObjectiveRating(history, { objectiveId: 11, dateOfService: '' })).toBeNull();
});
it('separates other raters and skips nonnumeric dispositions', () => {
  const rows = [
    { id: 1, objective_id: 11, date_of_service: '2026-09-01', scale_value: 3, rater_kind: 'other', rater_label: 'Guardian' },
    { id: 2, objective_id: 11, date_of_service: '2026-09-02', scale_value: 7, rater_kind: 'other', rater_label: 'Teacher' },
    { id: 3, objective_id: 11, date_of_service: '2026-09-03', scale_value: 8, disposition: 'deferred', rater_kind: 'other', rater_label: 'Guardian' }
  ];
  expect(priorObjectiveRating(rows, { objectiveId: 11, dateOfService: '2026-09-15', raterKind: 'other', raterLabel: 'Guardian' }).id).toBe(1);
});
for (const [start, previous, current, target] of [[8, 4, 6, 3], [7, 4, 5, 3], [4, 7, 5, 8]]) {
  it(`explains session decline and baseline improvement for ${start} → ${previous} → ${current}`, async () => {
    const wrapper = mount(Ratings, { props: { dateOfService: '2026-09-15', goals: [{ id: 1, goal_index: 1, goal_text: 'Synthetic goal', objectives: [{ id: 11, objective_index: 1, scale_start: start, scale_target: target }] }], previousRatings: [{ objective_id: 11, date_of_service: '2026-09-01', scale_value: previous }] } });
    expect(wrapper.find('.na-scale-goal-label').text()).toBe('Goal');
    expect(wrapper.find('.na-scale-goal-label').element.parentElement.textContent).toContain(String(target));
    await wrapper.findAll('.na-scale-btn')[current - 1].trigger('click');
    expect(wrapper.find('.na-obj-compact-list').text()).toContain(`Farther from goal since previous session on 2026-09-01 (${previous} → ${current})`);
    expect(wrapper.find('.na-obj-compact-list').text()).toContain(`Closer to goal since treatment started (${start} → ${current})`);
    const [entries] = wrapper.emitted('update:ratings').at(-1);
    expect(entries[0].progressLabel).toBe('regressed');
    expect(buildObjectiveRatingsContextText(entries)).toContain('since treatment started');
    await wrapper.setProps({ dateOfService: '2026-08-15' });
    expect(wrapper.find('.na-obj-compact-list').text()).toContain('No earlier session rating');
    expect(wrapper.vm.getRatings()[0].previousScaleValue).toBeNull();
    wrapper.unmount();
  });
}
it('does not treat an undated current score as a previous session', async () => {
  const wrapper = mount(Ratings, { props: { dateOfService: '2026-09-15', goals: [{ id: 1, objectives: [{ id: 11, scale_current: 9, scale_start: 8, scale_target: 3 }] }] } });
  expect(wrapper.find('.prev').exists()).toBe(false);
  await wrapper.findAll('.na-scale-btn')[5].trigger('click');
  expect(wrapper.text()).toContain('No earlier session rating');
  wrapper.unmount();
});
