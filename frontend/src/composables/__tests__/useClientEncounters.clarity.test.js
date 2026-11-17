import { expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
import api from '../../services/api';
import { useClientEncounters } from '../useClientEncounters';
it('26 future recurring appointments are zero unsigned notes and not the last session', async () => {
  const upcoming = Array.from({ length: 26 }, (_, i) => ({ id: i, service_date: `2099-12-${String(i+1).padStart(2,'0')}`, display_state: 'planned', note_status: 'planned' }));
  api.get.mockResolvedValue({ data: { encounters: [...upcoming, { id: 44, service_date: '2026-10-01', display_state: 'past', note_status: null }] } });
  const scope = effectScope(); const record = scope.run(() => useClientEncounters(ref(2), ref(4), { medicalOnly: true }));
  await flushPromises();
  expect(record.unsignedNotesCount.value).toBe(0);
  expect(record.lastSession.value.id).toBe(44);
  expect(record.sessionCount.value).toBe(1);
  record.encounters.value.push({ id: 45, display_state: 'past', note_status: 'draft' });
  expect(record.unsignedNotesCount.value).toBe(1);
  scope.stop();
});
it('does not count an imported nonbillable intake document as a session or unsigned clinical visit',async()=>{
 api.get.mockResolvedValue({data:{encounters:[{record_key:'intake:12',records_import:true,non_billable:true,display_state:'imported',service_date:'2026-07-29',note_status:'imported'}]}});
 const scope=effectScope(),record=scope.run(()=>useClientEncounters(ref(2),ref(4),{medicalOnly:true}));await flushPromises();expect(record.sessionCount.value).toBe(0);expect(record.lastSession.value).toBeNull();expect(record.unsignedNotesCount.value).toBe(0);scope.stop();
});
