import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import UserSmartGrid from '../UserSmartGrid.vue';
import RosterScopeFilters from '../RosterScopeFilters.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const fields = [
  { key: 'credential', label: 'Credential', group: 'Account', type: 'text' },
  { key: 'provider_start_date', label: 'Start date', group: 'Employment', type: 'date' },
  { key: 'role', label: 'Role', group: 'Employment', type: 'select', options: [{ value: 'provider', label: 'Provider' }] }
];
const organizations = [
  { id: 1, name: 'ITSCO', organization_type: 'agency' },
  { id: 2, name: 'Another tenant', organization_type: 'agency' },
  { id: 3, name: 'ITSCO School', organization_type: 'school', affiliated_agency_id: 1 },
  { id: 4, name: 'Other School', organization_type: 'school', affiliated_agency_id: 2 }
];
const rows = [
  { id: 1, first_name: 'Active', last_name: 'Person', role: 'provider', status: 'ACTIVE_EMPLOYEE', values: { credential: 'LPCC' } },
  { id: 2, first_name: 'Inactive', last_name: 'Person', role: 'provider', status: 'INACTIVE_EMPLOYEE', values: {} },
  { id: 3, first_name: 'Applicant', last_name: 'Person', role: 'provider', status: 'PROSPECTIVE', values: {} },
  { id: 4, first_name: 'Archived', last_name: 'Person', role: 'provider', status: 'ARCHIVED', values: {} },
  { id: 5, first_name: 'Legacy', last_name: 'Person', role: 'provider', status: 'active', values: {} }
];
const mountGrid = (props = {}) => mount(UserSmartGrid, {
  props: { requireTenant: true, agencyId: '1', statusFilter: 'ACTIVE_EMPLOYEE', organizations, ...props },
  global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } }
});
const people = (wrapper) => wrapper.findAll('.name-link').map((el) => el.text());
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.get.mockImplementation(async (url) => ({ data: url.endsWith('/fields') ? { fields } : { rows, meta: {} } }));
});

describe('tenant-scoped roster', () => {
  it('does not request or show an all-tenant roster before selection', async () => {
    const wrapper = mountGrid({ agencyId: '' });
    await flushPromises();
    expect(api.get).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Choose a tenant above');
    await wrapper.setProps({ agencyId: '1' });
    await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/users/grid', expect.objectContaining({ params: expect.objectContaining({ agency_id: '1' }) }));
  });

  it('filters each status even when Status is not a displayed column, without search overriding it', async () => {
    const wrapper = mountGrid();
    await flushPromises();
    expect(people(wrapper)).toEqual(['Active Person', 'Legacy Person']);
    await wrapper.find('.roster-search input').setValue('Inactive');
    expect(people(wrapper)).toEqual([]);
    await wrapper.find('.roster-search input').setValue('');
    for (const [status, name] of [['INACTIVE_EMPLOYEE', 'Inactive Person'], ['PROSPECTIVE', 'Applicant Person'], ['ARCHIVED', 'Archived Person']]) {
      await wrapper.setProps({ statusFilter: status });
      await flushPromises();
      expect(people(wrapper)).toEqual([name]);
    }
    expect(api.get).toHaveBeenLastCalledWith('/users/grid', expect.objectContaining({ params: expect.objectContaining({ includeArchived: 'true' }) }));
    await wrapper.setProps({ statusFilter: '' });
    await flushPromises();
    expect(people(wrapper)).toHaveLength(5);
  });

  it('keeps the applicants persona limited to applicants', async () => {
    const wrapper = mountGrid({ persona: 'applicants', statusFilter: '' });
    await flushPromises();
    expect(people(wrapper)).toEqual(['Applicant Person']);
  });

  it('sends the selected tenant, organization, and role together', async () => {
    mountGrid({ organizationId: '3', roleFilter: 'provider' });
    await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/users/grid', expect.objectContaining({ params: expect.objectContaining({ agency_id: '1', organization_id: '3', role: 'provider' }) }));
  });

  it('ignores the prior tenant response after a switch or clearing the tenant', async () => {
    let resolveOld;
    api.get.mockImplementation((url, options) => {
      if (url.endsWith('/fields')) return Promise.resolve({ data: { fields } });
      if (options.params.agency_id === '1') return new Promise((resolve) => { resolveOld = resolve; });
      return Promise.resolve({ data: { rows: [{ ...rows[0], first_name: 'New tenant' }] } });
    });
    const wrapper = mountGrid();
    await flushPromises();
    await wrapper.setProps({ agencyId: '2' });
    await flushPromises();
    resolveOld({ data: { rows } });
    await flushPromises();
    expect(people(wrapper)).toEqual(['New tenant Person']);
    await wrapper.setProps({ agencyId: '' });
    await flushPromises();
    expect(people(wrapper)).toEqual([]);
  });

  it('searches columns by label and category and keeps selected columns visible', async () => {
    const wrapper = mountGrid();
    await flushPromises();
    await wrapper.find('.roster-toolbar button').trigger('click');
    const search = wrapper.find('input[placeholder="Find a column or category…"]');
    await search.setValue('employment');
    expect(wrapper.find('.roster-picker-grid').text()).toContain('Start date');
    expect(wrapper.find('.roster-picker-grid').text()).not.toContain('Credential');
    expect(wrapper.find('.roster-selected-fields').text()).toContain('Credential');
    await search.setValue('credential');
    expect(wrapper.findAll('.roster-picker-group')).toHaveLength(1);
    await search.setValue('does not exist');
    expect(wrapper.findAll('.roster-picker-group')).toHaveLength(0);
    expect(wrapper.text()).toContain('No columns match');
  });

  it('removes hidden people from the bulk selection when searching', async () => {
    const wrapper = mountGrid();
    await flushPromises();
    await wrapper.find('thead input[type="checkbox"]').setValue(true);
    expect(wrapper.find('.roster-bulk').text()).toContain('2 selected');
    await wrapper.find('.roster-search input').setValue('Legacy');
    expect(wrapper.find('.roster-bulk').text()).toContain('1 selected');
  });
});

it('separates searchable tenants from their affiliated organizations and resets children on tenant change', async () => {
  const wrapper = mount(RosterScopeFilters, { props: { organizations, agencyId: '1', organizationId: '3' } });
  expect(wrapper.find('#roster-tenant').text()).not.toContain('School');
  expect(wrapper.find('#roster-organization').text()).toContain('ITSCO School');
  expect(wrapper.find('#roster-organization').text()).not.toContain('Other School');
  await wrapper.find('input[aria-label="Search tenants"]').setValue('itsco');
  expect(wrapper.find('#roster-tenant').text()).not.toContain('Another tenant');
  await wrapper.find('input[aria-label="Search tenants"]').setValue('');
  await wrapper.find('#roster-tenant').setValue('2');
  expect(wrapper.emitted('update:organizationId')).toEqual([['']]);
  expect(wrapper.emitted('update:agencyId')).toEqual([['2']]);
  await wrapper.setProps({ agencyId: '2', organizationId: '' });
  expect(wrapper.find('#roster-organization').text()).not.toContain('ITSCO School');
  await wrapper.setProps({ agencyId: '' });
  expect(wrapper.find('#roster-organization').attributes('disabled')).toBeDefined();
  expect(wrapper.find('#roster-organization').text()).not.toContain('School');
});

it('keeps the ten-column limit while searching and allows removing a selected column', async () => {
  const catalog = Array.from({ length: 11 }, (_, i) => ({ key: `field_${i}`, label: `Field ${i}`, group: 'Account', type: 'text' }));
  localStorage.setItem('roster-editor-fields:employees', JSON.stringify(catalog.slice(0, 10).map((f) => f.key)));
  api.get.mockImplementation(async (url) => ({ data: url.endsWith('/fields') ? { fields: catalog } : { rows: [] } }));
  const wrapper = mountGrid();
  await flushPromises();
  await wrapper.find('.roster-toolbar button').trigger('click');
  await wrapper.find('input[placeholder="Find a column or category…"]').setValue('Field 10');
  expect(wrapper.find('.roster-picker-grid input').attributes('disabled')).toBeDefined();
  await wrapper.find('button[aria-label="Remove Field 0 column"]').trigger('click');
  await flushPromises();
  expect(wrapper.find('.roster-picker-grid input').attributes('disabled')).toBeUndefined();
});

it('updates status filtering immediately after saving a Status cell', async () => {
  localStorage.setItem('roster-editor-fields:employees', JSON.stringify(['status']));
  api.get.mockImplementation(async (url) => ({ data: url.endsWith('/fields') ? { fields: [{ key: 'status', label: 'Status', group: 'Employment', type: 'select', options: [{ value: 'ACTIVE_EMPLOYEE', label: 'Active' }, { value: 'INACTIVE_EMPLOYEE', label: 'Inactive' }] }] } : { rows: [{ ...rows[0], values: { status: 'ACTIVE_EMPLOYEE' } }] } }));
  api.put.mockResolvedValue({ data: {} });
  const wrapper = mountGrid();
  await flushPromises();
  await wrapper.find('tbody select').setValue('INACTIVE_EMPLOYEE');
  await flushPromises();
  expect(people(wrapper)).toEqual([]);
  expect(api.put).toHaveBeenCalledWith('/users/grid/cells', { agencyId: '1', updates: [{ userId: 1, field: 'status', value: 'INACTIVE_EMPLOYEE' }] }, expect.anything());
});
