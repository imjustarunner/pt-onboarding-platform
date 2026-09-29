import { afterEach, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SupervisorDirectoryCard from '../SupervisorDirectoryCard.vue';

let wrapper;
const assignment = {
  id: 1, supervisee_id: 20, supervisee_first_name: 'Alex', supervisee_last_name: 'Lee',
  supervisee_email: 'alex@example.test', supervisor_type: 'clinical', agency_name: 'Agency A', is_primary: 1
};
const render = (props = {}) => mount(SupervisorDirectoryCard, {
  props: {
    supervisor: { id: 10, first_name: 'Sam', last_name: 'Finch', email: 'sam@example.test' },
    roleLabel: 'Provider', profilePath: (id) => `/test-agency/admin/users/${id}`,
    assignments: [assignment], ...props
  },
  global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })] }
});
afterEach(() => wrapper?.unmount());

it('opens the nested team by default and groups a person across roles and agencies', () => {
  wrapper = render({ assignments: [assignment,
    { ...assignment, id: 2, supervisee_id: '20', supervisor_type: 'billing', is_primary: 0 },
    { ...assignment, id: 3, supervisor_type: 'manager', agency_name: 'Agency B', is_primary: 0 }
  ] });
  expect(wrapper.get('details').attributes('open')).toBeDefined();
  expect(wrapper.get('summary').text()).toBe('1 assigned person');
  expect(wrapper.findAll('.supervisor-person')).toHaveLength(1);
  expect(wrapper.findAll('.person-assignments li')).toHaveLength(3);
  for (const text of ['Clinical supervisor', 'Billing supervisor', 'Manager', 'Agency A', 'Agency B', 'Primary']) {
    expect(wrapper.get('.supervisor-people').text()).toContain(text);
  }
  expect(wrapper.get('.supervisor-heading').text()).toContain('Provider');
  expect(wrapper.findAll('.primary-label')).toHaveLength(1);
});

it('links both supervisors and assigned people to their scoped profiles', async () => {
  wrapper = render();
  expect(wrapper.get('h3 a').attributes('href')).toBe('/test-agency/admin/users/10');
  expect(wrapper.get('.person-name').attributes('href')).toBe('/test-agency/admin/users/20');
  await wrapper.get('.person-name').trigger('click');
  expect(wrapper.emitted('open-profile')).toHaveLength(1);
  await wrapper.get('.supervisor-heading button').trigger('click');
  expect(wrapper.emitted('add')).toHaveLength(1);
});

it('distinguishes loading and failed requests from an empty team and allows retry', async () => {
  wrapper = render({ assignments: [], loading: true });
  expect(wrapper.get('[role="status"]').text()).toContain('Loading');
  expect(wrapper.text()).not.toContain('No supervisees assigned');
  await wrapper.setProps({ loading: false, error: 'Could not load assignments.' });
  expect(wrapper.text()).not.toContain('0 assigned people');
  expect(wrapper.text()).not.toContain('No supervisees assigned');
  await wrapper.get('[role="alert"] button').trigger('click');
  expect(wrapper.emitted('retry')).toHaveLength(1);
  await wrapper.setProps({ error: '' });
  expect(wrapper.get('summary').text()).toBe('0 assigned people');
  expect(wrapper.text()).toContain('No supervisees assigned.');
  expect(wrapper.find('.supervision-roles').exists()).toBe(false);
});
