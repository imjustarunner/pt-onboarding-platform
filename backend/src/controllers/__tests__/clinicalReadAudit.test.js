import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[]]) }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn(async sql => sql.includes('FROM clinical_sessions') ? [[{ id: 167, agency_id: 450, client_id: 2297 }]] : [[]]) } }));
vi.mock('../../services/noteAidChartAudit.service.js', () => ({ logNoteAidChartEvent: vi.fn() }));
vi.mock('../../services/clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: vi.fn() } }));
vi.mock('../../services/schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: vi.fn(async () => false), schedulingResponseForUser: vi.fn(async (_user, _agency, body) => body) }));
vi.mock('../../models/clinical/ClinicalNote.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/clinical/ClinicalTreatmentPlan.model.js', () => ({ default: { findById: vi.fn() } }));
import Note from '../../models/clinical/ClinicalNote.model.js';
import Plan from '../../models/clinical/ClinicalTreatmentPlan.model.js';
import Eligibility from '../../services/clinicalEligibility.service.js';
import { logNoteAidChartEvent } from '../../services/noteAidChartAudit.service.js';
import { getClinicalNoteById, getTreatmentPlanById } from '../medicalBilling.controller.js';
const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() });
beforeEach(() => {
  vi.clearAllMocks(); Eligibility.ensureAgencyAccess.mockResolvedValue(true);
  Note.findById.mockResolvedValue({ id: 444, client_id: 2297, agency_id: 450, clinical_session_id: 167, note_payload: JSON.stringify({ sections: { Narrative: 'SYNTHETIC PRIVATE NARRATIVE' } }), note_type: 'INTAKE', metadata_json: JSON.stringify({ serviceCode: '90791' }) });
  Plan.findById.mockResolvedValue({ id: 55, agency_id: 450, client_id: 2297, plan_json: { goal: 'PRIVATE GOAL' } });
});
it.each([{ id: 1439, role: 'provider' }, { id: 1438, role: 'provider_plus' }])('audits each authorized clinician opening a 90791 record with exact IDs, not the narrative', async (user) => {
  const req = { user, params: { noteId: '444' }, query: {} }, res = response(), next = vi.fn();
  await getClinicalNoteById(req, res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalled();
  expect(logNoteAidChartEvent).toHaveBeenCalledWith(req, { agencyId: 450, clientId: 2297, action: 'clinical_note_viewed', metadata: { noteId: 444, clinicalSessionId: 167 } });
  expect(JSON.stringify(logNoteAidChartEvent.mock.calls[0][1])).not.toContain('PRIVATE');
});
it('audits treatment-plan reading only after agency/client ownership is verified', async () => {
  const req = { user: { id: 1439, role: 'provider' }, params: { planId: '55' }, query: { agencyId: '450', clientId: '2297' } }, res = response();
  await getTreatmentPlanById(req, res, vi.fn());
  expect(logNoteAidChartEvent).toHaveBeenCalledWith(req, { agencyId: 450, clientId: 2297, action: 'clinical_treatment_plan_viewed', metadata: { treatmentPlanId: 55 } });
  vi.clearAllMocks(); Plan.findById.mockResolvedValue({ id: 55, agency_id: 999, client_id: 2297 });
  const denied = response(); await getTreatmentPlanById(req, denied, vi.fn());
  expect(denied.status).toHaveBeenCalledWith(404); expect(logNoteAidChartEvent).not.toHaveBeenCalled();
});
