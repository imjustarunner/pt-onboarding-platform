import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
import Modal from '../EhrPatientListImportModal.vue';

const wrappers = [];
const existing = { id: 42, agency_id: 2, full_name: 'Ann Example', date_of_birth: '2000-01-02', provider_id: 7 };
const rowText = 'Ann Example\t1/2/2000\t(555) 111-2222';
const createCalls = () => api.post.mock.calls.filter(([url]) => url === '/clients');
const mutations = () => [...api.post.mock.calls, ...api.put.mock.calls];

async function open(text = rowText) {
  const wrapper = mount(Modal, { props: { open: true, providerUserId: 7, agencyId: 2 } });
  wrappers.push(wrapper);
  await wrapper.find('textarea').setValue(text);
  return wrapper;
}
async function submit(wrapper) {
  await wrapper.find('.ehr-btn-primary').trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.post.mockImplementation(async url => url === '/clients' ? { data: { client: { id: 51 } } } : { data: {} });
  api.put.mockResolvedValue({ data: {} });
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); });

it('blocks failed existing-client lookups on every retry without creating or assigning a client', async () => {
  api.get.mockRejectedValue(new Error('Unavailable'));
  const wrapper = await open();
  await submit(wrapper);
  await submit(wrapper);
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(mutations()).toHaveLength(0);
  expect(wrapper.text()).toContain('Existing-client lookup failed');
  expect(wrapper.emitted('imported')).toBeUndefined();
});

it('blocks ambiguous name and DOB matches and identifies both charts for review', async () => {
  api.get.mockResolvedValue({ data: [existing, { ...existing, id: 43 }] });
  const wrapper = await open();
  await submit(wrapper);
  expect(mutations()).toHaveLength(0);
  expect(wrapper.text()).toContain('Multiple charts match');
  expect(wrapper.text()).toContain('#42, #43');
});

it('requires review for a matching name with missing DOB, even beside an exact match', async () => {
  api.get.mockResolvedValue({ data: [existing, { ...existing, id: 43, date_of_birth: null }] });
  const wrapper = await open();
  await submit(wrapper);
  expect(mutations()).toHaveLength(0);
  expect(wrapper.text()).toContain('#43 lack a date of birth');
});

it('finds archived charts and stops for reviewed restoration rather than creating a duplicate', async () => {
  api.get.mockResolvedValue({ data: [{ ...existing, status: 'ARCHIVED' }] });
  const wrapper = await open();
  await submit(wrapper);
  expect(api.get).toHaveBeenCalledWith('/clients', expect.objectContaining({ params: expect.objectContaining({ agency_id: 2, includeArchived: true }) }));
  expect(mutations()).toHaveLength(0);
  expect(wrapper.text()).toContain('Matching chart #42 is archived');
});

it.each([
  { clients: null },
  { items: [existing], total: 2 },
  { clients: [{ full_name: 'Ann Example' }] },
  [{ ...existing, agency_id: 99 }]
])('stops on incomplete or out-of-agency lookup responses (%j)', async data => {
  api.get.mockResolvedValue({ data });
  const wrapper = await open();
  await submit(wrapper);
  expect(mutations()).toHaveLength(0);
  expect(wrapper.text()).toContain('Existing-client lookup was incomplete');
});

it('links a unique name and DOB match to the selected provider without replacing demographics', async () => {
  api.get.mockResolvedValue({ data: [{ ...existing, provider_id: null }] });
  const wrapper = await open();
  await submit(wrapper);
  expect(api.put).toHaveBeenCalledWith('/clients/42/provider', { provider_id: 7 }, expect.anything());
  expect(api.post).not.toHaveBeenCalled();
  expect(wrapper.emitted('imported')[0][0]).toMatchObject({ created: 0, matched: 1, failures: [] });
});

it('preserves legitimate no-match creation and does not repeat successful rows on retries', async () => {
  api.get.mockResolvedValue({ data: [{ ...existing, date_of_birth: '1999-01-02' }] });
  const wrapper = await open();
  await submit(wrapper);
  await submit(wrapper);
  expect(createCalls()).toHaveLength(1);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(createCalls()[0][1]).toMatchObject({ date_of_birth: '2000-01-02' });
  expect(api.post).toHaveBeenCalledWith('/clients/51/demographics/import', expect.objectContaining({ demographics: expect.objectContaining({ dateOfBirth: '2000-01-02' }) }), expect.anything());
  expect(wrapper.emitted('imported')[0][0]).toMatchObject({ created: 1, matched: 0 });
});

it('keeps partial successes visible and retries only failed rows before reporting completion', async () => {
  let lookupAvailable = false;
  api.get.mockImplementation(async (_url, options) => {
    if (options.params.search === 'Ben Example' && !lookupAvailable) throw new Error('Unavailable');
    return { data: options.params.search === 'Ben Example' ? [{ ...existing, id: 52, full_name: 'Ben Example' }] : [] };
  });
  const wrapper = await open(`${rowText}\nBen Example\t1/2/2000`);
  await submit(wrapper);
  expect(wrapper.emitted('imported')).toBeUndefined();
  expect(wrapper.text()).toContain('Ben Example: Existing-client lookup failed');
  expect(createCalls()).toHaveLength(1);
  lookupAvailable = true;
  await submit(wrapper);
  expect(createCalls()).toHaveLength(1);
  expect(api.get.mock.calls.filter(([, options]) => options.params.search === 'Ann Example')).toHaveLength(1);
  expect(wrapper.emitted('imported')[0][0]).toMatchObject({ created: 1, matched: 1, failures: [] });
});

it('does not create again after an uncertain creation response leaves a same-name chart without DOB', async () => {
  api.get.mockResolvedValueOnce({ data: [] }).mockResolvedValue({ data: [{ ...existing, date_of_birth: null }] });
  api.post.mockRejectedValue(new Error('Response lost'));
  const wrapper = await open();
  await submit(wrapper);
  await submit(wrapper);
  expect(createCalls()).toHaveLength(1);
  expect(api.put).not.toHaveBeenCalled();
  expect(wrapper.text()).toContain('lack a date of birth');
});

it('does not overwrite a different client returned by legacy initials reuse', async () => {
  api.post.mockResolvedValue({ data: { reused: true, client: { ...existing, full_name: 'Alex Example' } } });
  const wrapper = await open();
  await submit(wrapper);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(wrapper.text()).toContain('server returned an existing chart');
  expect(wrapper.emitted('imported')).toBeUndefined();
});

it('keeps failed additional-provider assignments pending and retries without creating a chart', async () => {
  api.get.mockResolvedValue({ data: [{ ...existing, provider_id: 8, organization_id: 12 }] });
  api.post.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({ data: {} });
  const wrapper = await open();
  await submit(wrapper);
  expect(wrapper.emitted('imported')).toBeUndefined();
  expect(wrapper.text()).toContain('provider assignment was not saved');
  await submit(wrapper);
  expect(createCalls()).toHaveLength(0);
  expect(api.post.mock.calls.filter(([url]) => url === '/clients/42/provider-assignments')).toHaveLength(2);
  expect(wrapper.emitted('imported')[0][0]).toMatchObject({ matched: 1, coAssigned: 1, failures: [] });
});

it('requires assignment review when an existing primary provider has no organization for co-assignment', async () => {
  api.get.mockResolvedValue({ data: [{ ...existing, provider_id: 8 }] });
  const wrapper = await open();
  await submit(wrapper);
  expect(mutations()).toHaveLength(0);
  expect(wrapper.emitted('imported')).toBeUndefined();
  expect(wrapper.text()).toContain('needs an organization for an additional assignment');
});

it('retries failed demographics on the newly created chart without recreating or looking it up again', async () => {
  let demographicAttempts = 0;
  api.post.mockImplementation(async url => {
    if (url === '/clients') return { data: { client: { id: 51 } } };
    if (++demographicAttempts === 1) throw new Error('Unavailable');
    return { data: {} };
  });
  const wrapper = await open();
  await submit(wrapper);
  expect(wrapper.emitted('imported')).toBeUndefined();
  expect(wrapper.text()).toContain('Chart #51 was created, but demographics were not saved');
  await submit(wrapper);
  expect(createCalls()).toHaveLength(1);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(demographicAttempts).toBe(2);
  expect(wrapper.emitted('imported')[0][0]).toMatchObject({ created: 1, failures: [] });
});

it('stops after a lookup when the selected provider changes before it returns', async () => {
  let resolveLookup;
  api.get.mockImplementation(() => new Promise(resolve => { resolveLookup = resolve; }));
  const wrapper = await open();
  await wrapper.find('.ehr-btn-primary').trigger('click');
  await wrapper.setProps({ providerUserId: 9 });
  resolveLookup({ data: [] });
  await flushPromises();
  expect(mutations()).toHaveLength(0);
  expect(wrapper.emitted('imported')).toBeUndefined();
  expect(wrapper.text()).toContain('provider or agency changed during import');
});

it('retains a created chart but does not seed or report it in a changed agency context', async () => {
  let resolveCreate;
  api.post.mockImplementation(url => url === '/clients' ? new Promise(resolve => { resolveCreate = resolve; }) : Promise.resolve({ data: {} }));
  const wrapper = await open();
  await wrapper.find('.ehr-btn-primary').trigger('click');
  await flushPromises();
  await wrapper.setProps({ agencyId: 3 });
  resolveCreate({ data: { client: { id: 51 } } });
  await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(wrapper.emitted('imported')).toBeUndefined();
  await wrapper.setProps({ agencyId: 2 });
  await wrapper.find('textarea').setValue(rowText);
  await submit(wrapper);
  expect(createCalls()).toHaveLength(1);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenLastCalledWith('/clients/51/demographics/import', expect.anything(), expect.anything());
  expect(wrapper.emitted('imported')[0][0]).toMatchObject({ created: 1, failures: [] });
});
