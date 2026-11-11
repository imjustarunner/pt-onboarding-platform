import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), push: vi.fn() }));
vi.mock('../../../../services/api', () => ({ default: { get: m.get } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: m.push }), useRoute: () => ({ params: { organizationSlug: 'demo' } }) }));
import Overview from '../ClientRecordsOverview.vue';
let wrapper;
beforeEach(() => vi.clearAllMocks());
afterEach(() => wrapper?.unmount());
const open = async () => { wrapper = mount(Overview, { props: { clientId: 2415 } }); await flushPromises(); return wrapper; };
const activity = label => wrapper.findAll('.rco-table').at(0).findAll('tbody tr').find(row => row.find('td').text() === label);

it('shows permitted enrollment receipts without claiming missing or active consents after clinical access is denied', async () => {
  m.get.mockImplementation(async url => {
    if (url.endsWith('/chart-artifacts')) throw { response: { status: 403 } };
    return { data: [
      { id: 1, document_type: 'Intake Packet', mime_type: 'application/pdf', created_at: '2026-11-07T16:08:00Z' },
      { id: 2, document_type: 'Intake Responses', mime_type: 'application/pdf', created_at: '2026-11-07T16:08:00Z' }
    ] };
  });
  await open();
  const row = activity('Enrollment receipts');
  expect(row.findAll('td').map(cell => cell.text()).slice(0, 3)).toEqual(['Enrollment receipts', 'On file', '2']);
  expect(wrapper.text()).not.toContain('External records');
  expect(wrapper.text()).toContain('Individual authorization details are not available in this view.');
  expect(wrapper.find('.rco-auth-counts').exists()).toBe(false);
  await row.find('button').trigger('click');
  expect(wrapper.emitted('navigate')).toEqual([['documents']]);
  expect(m.get.mock.calls.map(([url]) => url)).toEqual(['/phi-documents/clients/2415/chart-artifacts', '/phi-documents/clients/2415/enrollment-receipts']);
});

it('retains full authorization results and counts all documents beyond the five-item preview', async () => {
  m.get.mockResolvedValue({ data: { artifacts: [
    { id: 'signed-consent', kind: 'informed_group_consent', title: 'Consent', missing: false, hasSignature: true },
    { id: 'missing-roi', kind: 'smart_roi', title: 'ROI', missing: true },
    ...Array.from({ length: 7 }, (_, index) => ({ id: `doc-${index}`, kind: 'signed_form', title: `Document ${index}`, missing: false }))
  ] } });
  await open();
  expect(activity('Enrollment & consents').findAll('td').map(cell => cell.text()).slice(0, 3)).toEqual(['Enrollment & consents', 'On file', '1']);
  expect(activity('Documents & uploads').findAll('td')[2].text()).toBe('8');
  expect(wrapper.find('.rco-auth-counts').exists()).toBe(true);
  expect(wrapper.text()).not.toContain('Individual authorization details are not available');
});

it('reports unavailable authorization data rather than Due when both authorized endpoints fail', async () => {
  m.get.mockRejectedValue({ response: { status: 403 } });
  await open();
  expect(activity('Enrollment & consents').findAll('td').map(cell => cell.text()).slice(0, 3)).toEqual(['Enrollment & consents', 'Unavailable', '—']);
  expect(wrapper.find('.rco-auth-counts').exists()).toBe(false);
});

it('shows restricted clinical content accurately for Support instead of asserting zero or no plans', async () => {
 m.get.mockResolvedValue({data:[]});
 wrapper=mount(Overview,{props:{clientId:2271,agencyId:450,operationalOnly:true}});await flushPromises();
 expect(wrapper.text()).toContain('Restricted');expect(wrapper.text()).not.toContain('No treatment plans on file yet.');expect(wrapper.text()).not.toContain('No progress notes on the chart yet.');
 expect(wrapper.findAll('button').some(b=>b.text()==='+ New note')).toBe(false);expect(m.get.mock.calls.some(([url])=>url.includes('/medical-billing/'))).toBe(false);
});
