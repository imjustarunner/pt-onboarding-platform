import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../../services/clinicalAppointmentAlerts.service.js',()=>({default:{assertReviewed:vi.fn(async()=>{})}}));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(async () => [{ id: 450 }]) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 450 })) } }));
vi.mock('../../models/ClinicalNoteDraft.model.js', () => ({ default: { create: vi.fn(async input => ({ id: 285, agency_id: input.agencyId })),findByIdForUser:vi.fn(),updateForUser:vi.fn() } }));
vi.mock('../../services/staffCareEligibility.service.js', () => ({ readStaffCareEligibility: vi.fn(), requireStaffCareEligibility: vi.fn() }));
vi.mock('../../utils/noteAidClientAgency.js', () => ({ coerceNoteAidAgencyForClient: vi.fn(async () => ({ agencyId: 450 })),
  canRemapDraftAgency: vi.fn(), listClientAgencyMembershipIds: vi.fn() }));
vi.mock('../../services/noteAidChartAudit.service.js', () => ({ logNoteAidChartEvent: vi.fn() }));
import clinicalAppointmentAlerts from '../../services/clinicalAppointmentAlerts.service.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import ClinicalNoteDraft from '../../models/ClinicalNoteDraft.model.js';
import { createClinicalNoteDraft, generateClinicalNote, patchClinicalNoteDraft } from '../clinicalNoteGenerator.controller.js';
const canonical = { id: 140, agency_id: 450, client_id: 2277, provider_user_id: 1433, appointment_id: 84,
  service_code: '90837', source_timezone: 'America/Denver', scheduled_start_at: '2026-10-19 15:00:00' };
const request = () => ({ user: { id: 1433, role: 'provider' }, body: { agencyId: 450, clientId: 2277,
  clinicalSessionId: 140, dateOfService: '2026-10-19', serviceCode: '90837', inputText: 'Previously entered clinician facts.' } });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64')); clinicalPool.execute.mockResolvedValue([[canonical]]); });
afterEach(() => vi.unstubAllEnvs());

it('routes an explicitly selected actual session to its draft without inserting or editing a clinical session', async () => {
  const req = request(), res = response(), next = vi.fn();
  await createClinicalNoteDraft(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(ClinicalNoteDraft.create).toHaveBeenCalledWith(expect.objectContaining({ clinicalSessionId: 140,
    clientId: 2277, agencyId: 450, officeEventId: null, dateOfService: '2026-10-19', serviceCode: '90837' }));
  expect(req.body.inputText).toBe('Previously entered clinician facts.');
  expect(clinicalPool.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});
it('requires an explicit session even when a same-day client and service match exists', async () => {
  clinicalPool.execute.mockResolvedValue([[canonical, { ...canonical, id: 141, appointment_id: 85 }]]);
  const next = vi.fn(), req = request(); delete req.body.clinicalSessionId;
  await createClinicalNoteDraft(req, response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409, code: 'NOTE_SESSION_CONTEXT_REQUIRED' }));
  expect(ClinicalNoteDraft.create).not.toHaveBeenCalled();
  expect(clinicalPool.execute).not.toHaveBeenCalled();
});
it('rejects a foreign explicit session without falling back to a guessed encounter', async () => {
  clinicalPool.execute.mockResolvedValue([[{ ...canonical, client_id: 9 }]]);
  const req = request(), next = vi.fn(); req.body.clinicalSessionId = 140;
  await createClinicalNoteDraft(req, response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(ClinicalNoteDraft.create).not.toHaveBeenCalled();
  expect(clinicalPool.execute).toHaveBeenCalledTimes(1);
});

it('checks the current appointment alert before creating any draft or session',async()=>{clinicalAppointmentAlerts.assertReviewed.mockRejectedValueOnce(Object.assign(new Error('Review appointment alert'),{status:409,code:'APPOINTMENT_ALERT_REVIEW_REQUIRED'}));const req=request(),next=vi.fn();await createClinicalNoteDraft(req,response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409,code:'APPOINTMENT_ALERT_REVIEW_REQUIRED'}));expect(ClinicalNoteDraft.create).not.toHaveBeenCalled();expect(clinicalPool.execute).not.toHaveBeenCalled();expect(req.body.inputText).toBe('Previously entered clinician facts.');});

it('never creates an initials-only full progress draft or synthesized encounter',async()=>{
  const req=request(),next=vi.fn();delete req.body.clientId;delete req.body.clinicalSessionId;req.body.initials='AB';
  await createClinicalNoteDraft(req,response(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409,code:'NOTE_SESSION_CONTEXT_REQUIRED'}));
  expect(ClinicalNoteDraft.create).not.toHaveBeenCalled();expect(clinicalPool.execute).not.toHaveBeenCalled();
});

it('blocks new full-workspace progress generation before querying or synthesizing a session',async()=>{
  const req=request(),res=response(),next=vi.fn();delete req.body.clinicalSessionId;req.body.toolId='clinical_psychotherapy_note';
  await generateClinicalNote(req,res,next);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({error:expect.objectContaining({message:expect.stringContaining('actual session')})}));
  expect(clinicalPool.execute).not.toHaveBeenCalled();expect(ClinicalNoteDraft.create).not.toHaveBeenCalled();
});

it('does not let automatic code selection create an unlinked full-workspace progress note',async()=>{
  const req=request(),res=response();delete req.body.clinicalSessionId;delete req.body.serviceCode;req.body.autoSelectCode=true;
  await generateClinicalNote(req,res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);expect(clinicalPool.execute).not.toHaveBeenCalled();
});

it.each([null,140])('preserves legacy progress text while refusing manual save without a real backed source (%s)',async oldSessionId=>{
  const legacy={id:285,user_id:1433,agency_id:450,client_id:2277,clinical_session_id:oldSessionId,office_event_id:null,
    service_code:'90837',date_of_service:'2026-10-19',input_text:'Original saved narrative',output_json:'{"meta":{"toolId":"clinical_psychotherapy_note"}}'};
  ClinicalNoteDraft.findByIdForUser.mockResolvedValue(legacy);
  clinicalPool.execute.mockResolvedValue([[{...canonical,appointment_id:null,office_event_id:null,billing_encounter_id:null}]]);
  const req=request(),next=vi.fn();req.params={draftId:'285'};delete req.body.clinicalSessionId;req.body.inputText='New unsaved edit';
  await patchClinicalNoteDraft(req,response(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409,code:'NOTE_SESSION_CONTEXT_REQUIRED'}));
  expect(ClinicalNoteDraft.updateForUser).not.toHaveBeenCalled();expect(legacy.input_text).toBe('Original saved narrative');
});

it('allows manual save after a legacy draft has been explicitly linked to a real session',async()=>{
  const linked={id:285,user_id:1433,agency_id:450,client_id:2277,clinical_session_id:140,office_event_id:null,
    service_code:'90837',date_of_service:'2026-10-19',input_text:'Original saved narrative',output_json:'{"meta":{"toolId":"clinical_psychotherapy_note"}}'};
  ClinicalNoteDraft.findByIdForUser.mockResolvedValue(linked);ClinicalNoteDraft.updateForUser.mockResolvedValue(linked);
  const req=request(),res=response(),next=vi.fn();req.params={draftId:'285'};
  await patchClinicalNoteDraft(req,res,next);
  expect(next).not.toHaveBeenCalled();expect(ClinicalNoteDraft.updateForUser).toHaveBeenCalled();
});
