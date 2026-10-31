import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(async () => [{ id: 450 }]) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 450 })) } }));
vi.mock('../../models/ClinicalNoteDraft.model.js', () => ({ default: { create: vi.fn(async input => ({ id: 285, agency_id: input.agencyId })) } }));
vi.mock('../../services/staffCareEligibility.service.js', () => ({ readStaffCareEligibility: vi.fn(), requireStaffCareEligibility: vi.fn() }));
vi.mock('../../utils/noteAidClientAgency.js', () => ({ coerceNoteAidAgencyForClient: vi.fn(async () => ({ agencyId: 450 })),
  canRemapDraftAgency: vi.fn(), listClientAgencyMembershipIds: vi.fn() }));
vi.mock('../../services/noteAidChartAudit.service.js', () => ({ logNoteAidChartEvent: vi.fn() }));
import clinicalPool from '../../config/clinicalDatabase.js';
import ClinicalNoteDraft from '../../models/ClinicalNoteDraft.model.js';
import { createClinicalNoteDraft } from '../clinicalNoteGenerator.controller.js';
const canonical = { id: 140, agency_id: 450, client_id: 2277, provider_user_id: 1433, appointment_id: 84,
  service_code: '90837', source_timezone: 'America/Denver', scheduled_start_at: '2026-10-19 15:00:00' };
const request = () => ({ user: { id: 1433, role: 'provider' }, body: { agencyId: 450, clientId: 2277,
  dateOfService: '2026-10-19', serviceCode: '90837', inputText: 'Previously entered clinician facts.' } });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64')); clinicalPool.execute.mockResolvedValue([[canonical]]); });
afterEach(() => vi.unstubAllEnvs());

it('routes a chart-initiated draft to the canonical session without inserting or editing a clinical session', async () => {
  const req = request(), res = response(), next = vi.fn();
  await createClinicalNoteDraft(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(ClinicalNoteDraft.create).toHaveBeenCalledWith(expect.objectContaining({ clinicalSessionId: 140,
    clientId: 2277, agencyId: 450, officeEventId: null, dateOfService: '2026-10-19', serviceCode: '90837' }));
  expect(req.body.inputText).toBe('Previously entered clinician facts.');
  expect(clinicalPool.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});
it('fails ambiguous same-day context before creating a draft or hiding the problem with an orphan session', async () => {
  clinicalPool.execute.mockResolvedValue([[canonical, { ...canonical, id: 141, appointment_id: 85 }]]);
  const next = vi.fn();
  await createClinicalNoteDraft(request(), response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409, code: 'NOTE_SESSION_CONTEXT_REQUIRED' }));
  expect(ClinicalNoteDraft.create).not.toHaveBeenCalled();
  expect(clinicalPool.execute).toHaveBeenCalledTimes(1);
});
it('rejects a foreign explicit session without falling back to a guessed encounter', async () => {
  clinicalPool.execute.mockResolvedValue([[{ ...canonical, client_id: 9 }]]);
  const req = request(), next = vi.fn(); req.body.clinicalSessionId = 140;
  await createClinicalNoteDraft(req, response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(ClinicalNoteDraft.create).not.toHaveBeenCalled();
  expect(clinicalPool.execute).toHaveBeenCalledTimes(1);
});
