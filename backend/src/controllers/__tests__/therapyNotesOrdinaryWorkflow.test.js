import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[]]) } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(async () => [{ id: 6 }]) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 6, slug: 'nlu' })) } }));
vi.mock('../../models/ClinicalNoteDraft.model.js', () => ({ default: { findByIdForUser: vi.fn(), updateForUser: vi.fn(), listRecentForUser: vi.fn() } }));
vi.mock('../../services/staffCareEligibility.service.js', () => ({ readStaffCareEligibility: vi.fn(), requireStaffCareEligibility: vi.fn(async () => ({credential:'Bachelors',credentialTier:'bachelors'})) }));
vi.mock('../../services/clinicalAppointmentAlerts.service.js', () => ({default:{assertReviewed:vi.fn(async()=>{})}}));
vi.mock('../../services/noteAidSignedSessions.service.js', () => ({ listSignedNoteSessions: vi.fn(async()=>[]), sessionMatchKey:vi.fn(),draftRowMatchKey:vi.fn() }));
vi.mock('../../services/clinicalDraftAppointmentRepair.service.js', () => ({ draftAppointmentOptions:vi.fn(),linkDraftAppointment:vi.fn() }));
import ClinicalNoteDraft from '../../models/ClinicalNoteDraft.model.js';
import { draftAppointmentOptions,linkDraftAppointment } from '../../services/clinicalDraftAppointmentRepair.service.js';
import { patchClinicalNoteDraft, repairClinicalDraftAppointment, generateClinicalNote, transcribeClinicalNoteAudio, listRecentClinicalNoteDrafts } from '../clinicalNoteGenerator.controller.js';
const copied={id:42,user_id:501,agency_id:6,client_id:null,clinical_session_id:null,office_event_id:null,output_json:JSON.stringify({_enc:true,_quickCopy:true,ciphertext:'not-read-for-routing-guard'})};
const req=()=>({user:{id:501,role:'provider'},params:{draftId:'42'},query:{agencyId:'6'},body:{agencyId:6,toolId:'clinical_h0004_note',serviceCode:'H0004',dateOfService:'2026-11-15',draftId:42,inputText:'Provider-authored narrative.'}});
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();ClinicalNoteDraft.findByIdForUser.mockResolvedValue(copied);});

it('refuses to change a saved generator note through the clinical draft patch endpoint',async()=>{
  const response=res();await patchClinicalNoteDraft(req(),response,vi.fn());
  expect(response.status).toHaveBeenCalledWith(409);expect(ClinicalNoteDraft.updateForUser).not.toHaveBeenCalled();
});
it('refuses to link a saved generator note to an appointment',async()=>{
  const response=res();await repairClinicalDraftAppointment(req(),response,vi.fn());
  expect(response.status).toHaveBeenCalledWith(409);expect(draftAppointmentOptions).not.toHaveBeenCalled();expect(linkDraftAppointment).not.toHaveBeenCalled();
});
it('refuses to overwrite a saved generator note through full-workspace generation',async()=>{
  const response=res(),next=vi.fn();await generateClinicalNote(req(),response,next);
  expect(response.status).toHaveBeenCalledWith(409);expect(ClinicalNoteDraft.updateForUser).not.toHaveBeenCalled();
});
it('keeps the original full-workspace audio endpoint retired',async()=>{
  const response=res();await transcribeClinicalNoteAudio(req(),response,vi.fn());expect(response.status).toHaveBeenCalledWith(410);
});
it('defensively excludes quick-copy rows from ordinary recent-note responses',async()=>{
  ClinicalNoteDraft.listRecentForUser.mockResolvedValue([copied,{id:43,user_id:501,agency_id:6,client_id:null,input_text:'Other note',output_json:'{"sections":{"Plan":"Existing note"}}'}]);
  const response=res();await listRecentClinicalNoteDrafts(req(),response,vi.fn());
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({drafts:[expect.objectContaining({id:43})]}));
});
