import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import History from '../NarrivaTreatmentHistory.vue';

describe('Up to five session treatment history', () => {
  it('shows a labeled graph, objective text, changes, and distinct self-reported check-in scores', () => {
    const wrapper = mount(History, { props: { history: {
      sessions: [{ id: 1, date: '2026-11-01' }, { id: 2, date: '2026-11-04' }],
      objectives: [{ id: 3, goal: 'Increase coping', objective: 'Practice a coping skill', trend: 'progressing', direction: 'higher', target: 8, points: [{ sessionId: 1, date: '2026-11-01', score: 3 }, { sessionId: 2, date: '2026-11-04', score: 5 }] }],
      changes: [{ id: 4, date: '2026-11-04', label: 'Objective updated', text: 'Practice frequency increased.' }],
      checkins: [{ id: 5, date: '2026-11-04', connection: 7, progress: 6 }]
    } } });
    expect(wrapper.get('svg').attributes('aria-label')).toContain('Practice a coping skill');
    expect(wrapper.text()).toContain('Increase coping'); expect(wrapper.text()).toContain('Progressing');
    expect(wrapper.text()).toContain('Practice frequency increased.'); expect(wrapper.get('.nh-checkins').text()).toContain('7');
    expect(wrapper.get('.nh-checkins').text()).toContain('6'); expect(wrapper.text()).toContain('2 of up to 5');
  });
  it('keeps real zero ratings, does not connect across missing scores, and distinguishes insufficient evidence from stagnation', () => {
    const wrapper = mount(History, { props: { history: { objectives: [{ id: 1, trend: 'insufficient', points: [{ score: 0, date: '2026-11-01' }, { score: null, date: '2026-11-02' }, { score: 3, date: '2026-11-03' }] }], checkins: [{ connection: 0, progress: null }] } } });
    expect(wrapper.get('.nh-trend').text()).toContain('Not enough comparable scores');
    expect(wrapper.findAll('polyline')).toHaveLength(2); expect(wrapper.findAll('circle')).toHaveLength(2);
    expect(wrapper.get('.nh-checkins tbody').text()).toContain('0'); expect(wrapper.get('.nh-checkins tbody').text()).toContain('—');
    expect(wrapper.find('.nh-trend--stagnant').exists()).toBe(false);
  });
  it('uses server-provided trend direction and supplements color with visible labels', () => {
    const wrapper = mount(History, { props: { history: { objectives: [
      { id: 1, trend: 'regression', objective: 'Symptoms', points: [{ score: 2 }, { score: 5 }] },
      { id: 2, trend: 'stagnation', objective: 'Engagement', points: [{ score: 5 }, { score: 5 }] }
    ] } } });
    expect(wrapper.get('.nh-trend--regression').text()).toContain('Regression');
    expect(wrapper.get('.nh-trend--stagnant').text()).toContain('Stagnation');
  });
  it('does not connect scores across a changed objective target and keeps each respondent labeled',()=>{
    const wrapper=mount(History,{props:{history:{objectives:[{id:'1:clinician',respondentLabel:'Clinician rating',trend:'insufficient',points:[{score:4,target:7},{score:5,target:7},{score:6,target:9}]}]}}});
    expect(wrapper.findAll('polyline')).toHaveLength(2);expect(wrapper.text()).toContain('Clinician rating');
  });
  it('shows missing and unavailable history explicitly and caps display at five sessions', () => {
    const wrapper = mount(History, { props: { history: { status: 'unavailable', sessions: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, date: `2026-11-0${i + 1}` })) } } });
    expect(wrapper.get('[role="status"]').text()).toContain('unavailable');
    expect(wrapper.text()).not.toContain('No plan changes'); expect(wrapper.text()).not.toContain('No client check-in scores recorded');
    expect(wrapper.findAll('.nh-sessions li')).toHaveLength(5); expect(wrapper.find('svg').exists()).toBe(false);
  });
});
