import { afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import {createPinia} from 'pinia';
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../../services/api', () => ({ default: { get: m.get } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ params: { organizationSlug: 'synthetic' } }) }));
import Overview from '../ClientRecordsOverview.vue';
import Feed from '../ClientClinicalNotesFeed.vue';
import MedicalRecord from '../../ClientMedicalRecordsTab.vue';
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); });
it('counts the unsigned-note category once and does not count contacts as unsigned', async () => {
  m.get.mockResolvedValue({ data: { notes: [{ id: 1, note_type: 'PROGRESS' }, { id: 2, note_type: 'CONTACT', review_only: true }], sessions: [], artifacts: [] } });
  wrapper = mount(Overview, { props: { clientId: 4, agencyId: 2, unsignedNotesCount: 1, alerts: [{ id: 'unsigned-notes', label: '1 unsigned notes' }, { id: 'no-diagnosis', label: 'No billing diagnosis' }] } });
  await flushPromises();
  expect(wrapper.findAll('.rco-metric').at(0).find('.rco-metric__v').text()).toBe('2');
  expect(wrapper.findAll('.rco-metric').find(c => c.text().includes('Unsigned items')).find('strong').text()).toBe('1');
});
it('labels an unscheduled 90791 as a draft with no service date beside a separate 90837 session', async () => {
  m.get.mockResolvedValue({ data: { notes: [{ id: 1, note_type: 'PROGRESS', title: 'Progress note', clinical_session_id: 7, created_at: '2026-11-15T19:00:00Z' }],
    sessions: [{ id: 7, agency_id: 2, service_code: '90837', scheduled_start_at: '2026-11-15T17:00:00Z' }],
    intakeNotes: [{ id: 2, service_code: '90791', status: 'DIAGNOSIS_PENDING', created_at: '2026-10-15T17:00:00Z', updated_at: '2026-11-15T18:00:00Z' }] } });
  wrapper = mount(Feed, { props: { clientId: 4, agencyId: 2 }, global: { plugins:[createPinia()], stubs: { ClientChartCompletedNote: true, ClientManualNoteForm: true, AppointmentChangeWizard: true } } });
  await flushPromises();
  expect(wrapper.text()).toContain('Intake draft (90791)');
  expect(wrapper.text()).toContain('Date of service not set · Added Oct 15, 2026');
  expect(wrapper.text()).toContain('Service date Nov 15, 2026');
  expect(wrapper.text()).toContain('90837');
});

it('keeps planned sessions out of Notes needed and labels elapsed appointments without claiming attendance', async () => {
  m.get.mockResolvedValue({ data: { encounters: [
    { id: 1, service_date: '2099-12-01', service_code: '90837', source: 'appointment', display_state: 'planned', note_status: 'planned' },
    { id: 2, service_date: '2026-11-15', service_code: '90837', source: 'appointment', display_state: 'past', note_status: null, billing_attached: false }
  ] } });
  wrapper = mount(MedicalRecord, { props: { clientId: 4, agencyId: 2 }, global: { stubs: { SchoolAbsenceRecords: true, EnrollmentPortalDocuments: true, SafetyPlansPanel: true, PhiDocumentsPanel: true } } });
  await flushPromises();
  expect(wrapper.findAll('.cc-enc-list-item')).toHaveLength(2);
  expect(wrapper.text()).toContain('attendance not confirmed');
  await wrapper.findAll('.cc-enc-filter-pill').find(b => b.text() === 'Notes needed').trigger('click');
  expect(wrapper.findAll('.cc-enc-list-item')).toHaveLength(1);
  expect(wrapper.find('.cc-enc-list-item').text()).toContain('90837');
  expect(wrapper.find('.cc-enc-list-item').text()).not.toContain('Planned');
});
