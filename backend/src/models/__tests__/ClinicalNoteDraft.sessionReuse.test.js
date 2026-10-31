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
  expect(pool.execute).toHaveBeenCalledTimes(1);
  expect(pool.execute.mock.calls[0][0].trim().startsWith('SELECT')).toBe(true);
});
