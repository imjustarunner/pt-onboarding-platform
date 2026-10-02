import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import PlanComparisonTable from '../PlanComparisonTable.vue';

describe('approved public feature comparison', () => {
  it('shows all 52 assignments, cumulative circles, and separate features', () => {
    const wrapper = mount(PlanComparisonTable);
    expect(wrapper.findAll('[data-feature]')).toHaveLength(52);
    const labels = key => wrapper.find(`[data-feature="${key}"]`).findAll('td .sr-only').map(cell => cell.text());
    expect(labels('ai_note_aid')).toEqual(['Included', 'Included', 'Included']);
    expect(labels('calendar_sync')).toEqual(['Not included', 'Included', 'Included']);
    expect(labels('hiringEnabled')).toEqual(['Not included', 'Not included', 'Included']);
    expect(labels('schoolPortals')).toEqual(['Not included', 'Not included', 'Not included']);
    expect(wrapper.text()).toContain('Documentation Hub');
    expect(wrapper.text()).not.toContain('AI Note Aid');
    expect(wrapper.text()).not.toContain('published after review');
  });
  it('filters by product without advertising platform-only features as AuricWell features', async () => {
    const wrapper = mount(PlanComparisonTable);
    expect(wrapper.find('[data-feature="hiringEnabled"]').text()).toContain('Platform only');
    await wrapper.find('select').setValue('auricwell');
    expect(wrapper.find('[data-feature="hiringEnabled"]').exists()).toBe(false);
    expect(wrapper.find('[data-feature="private_office"]').exists()).toBe(true);
  });
  it('searches descriptions and shows an empty state', async () => {
    const wrapper = mount(PlanComparisonTable);
    await wrapper.find('input').setValue('photo review');
    expect(wrapper.find('[data-feature="private_office"]').exists()).toBe(true);
    await wrapper.find('input').setValue('no such feature');
    expect(wrapper.findAll('[data-feature]')).toHaveLength(0);
    expect(wrapper.get('[role="status"]').text()).toContain('No features match');
  });
});
