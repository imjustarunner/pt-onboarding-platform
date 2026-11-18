import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import ClinicalNoteDraft from '../ClinicalNoteDraft.model.js';
beforeEach(() => vi.clearAllMocks());

it('uses agency and participant scope for an exact session or shared office appointment', async () => {
  pool.execute.mockResolvedValue([[]]);
  await ClinicalNoteDraft.findReusableOpen({ userId: 1433, agencyId: 450, clientId: 2277,
    clinicalSessionId: 140, officeEventId: 42, dateOfService: '2026-10-19', serviceCode: '90837' });
  const [event, session, date] = pool.execute.mock.calls;
  expect(event[0]).toContain('office_event_id = ? AND agency_id = ? AND client_id = ?');
  expect(event[1]).toEqual([1433, 42, 450, 2277]);
  expect(session[0]).toContain('clinical_session_id = ? AND agency_id = ? AND client_id = ?');
  expect(session[1]).toEqual([1433, 140, 450, 2277]);
  expect(date[0]).toContain('AND office_event_id IS NULL AND clinical_session_id IS NULL');
  expect(date[1]).toEqual([1433, 2277, '2026-10-19', 450]);
});
it('never overwrites authored content when opening an existing draft for the same appointment', async () => {
  const existing = { id: 285, user_id: 1433, agency_id: 450, client_id: 2277, clinical_session_id: 140,
    date_of_service: '2026-10-19', service_code: '90837', input_text: 'Existing authored material', output_json: 'Existing note sections' };
  pool.execute.mockResolvedValue([[existing]]);
  expect(await ClinicalNoteDraft.create({ userId: 1433, agencyId: 450, clientId: 2277, clinicalSessionId: 140,
    dateOfService: '2026-10-19', serviceCode: '90837', inputText: 'New context must not replace existing work' })).toEqual(existing);
  expect(pool.execute.mock.calls.filter(([sql]) => sql.includes('FROM clinical_note_drafts'))).toHaveLength(1);
  expect(pool.execute.mock.calls[0][0].trim().startsWith('SELECT')).toBe(true);
});

it('keeps encrypted quick-copy notes out of the ordinary library before applying the result limit', async () => {
  pool.execute.mockResolvedValue([[]]);
  await ClinicalNoteDraft.listRecentForUser({ userId: 501, agencyId: 6, limit: 100 });
  const [sql, values] = pool.execute.mock.calls[0];
  expect(values).toEqual([501, 7, 6]);
  expect(sql).toContain('JSON_VALID(d.output_json)');
  expect(sql).toContain("'$._quickCopy'");
  expect(sql.indexOf("<> 'true'")).toBeLessThan(sql.indexOf('LIMIT 100'));
});

it('retrieves saved generator notes only for the exact author and organization with no chart or session links', async () => {
  pool.execute.mockResolvedValue([[]]);
  await ClinicalNoteDraft.listQuickCopyForUser({ userId: 501, agencyId: 6 });
  const [sql, values] = pool.execute.mock.calls[0];
  expect(values).toEqual([501, 6]);
  expect(sql).toContain('d.user_id = ? AND d.agency_id = ?');
  expect(sql).toContain('d.client_id IS NULL AND d.clinical_session_id IS NULL AND d.office_event_id IS NULL');
  expect(sql).toContain("= 'true'");
});

it('does not reopen archived testing through the client and service-date fallback',async()=>{
  const archived={id:285,user_id:1,agency_id:2,client_id:3,clinical_session_id:139};
  const current={...archived,id:286,clinical_session_id:140};
  pool.execute.mockImplementation(async sql=>sql.includes('clinical_work_archive_resources')
    ? [[{resource_type:'draft',resource_id:285,archive_id:7}]] : [[archived,current]]);
  expect(await ClinicalNoteDraft.findReusableOpen({userId:1,agencyId:2,clientId:3,dateOfService:'2026-11-18',serviceCode:'90837'})).toEqual(current);
});
