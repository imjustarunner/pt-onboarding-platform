import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[]]) } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(async () => [{ id: 6 }]) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 6, slug: 'nlu' })) } }));
vi.mock('../../models/ClinicalNoteDraft.model.js', () => ({ default: { create: vi.fn(), updateForUser: vi.fn(), findByIdForUser: vi.fn(), listQuickCopyForUser: vi.fn() } }));
vi.mock('../../models/NoteAidAgencyCatalog.model.js', () => ({ default: { listSettings: vi.fn(async () => []) } }));
vi.mock('../../services/staffCareEligibility.service.js', () => ({ readStaffCareEligibility: vi.fn(), requireStaffCareEligibility: vi.fn(async () => { throw new Error('Not enabled for care'); }) }));
vi.mock('../../services/sessionAiPrivacy.service.js', () => ({ createSessionPrivacyContext: vi.fn(() => ({ redact: vi.fn(async text => text.replaceAll('Jane Example', 'client')) })) }));
vi.mock('../../services/clinicalKnowledgeBase.service.js', () => ({ getKnowledgeBaseContext: vi.fn(async () => ''), noteAidKnowledgeBaseOptions: vi.fn(value => value) }));
vi.mock('../../services/clinicalNoteWriter.service.js', () => ({ buildPromptForTool: vi.fn(({inputText}) => `Trained writer: ${inputText}`), generateClinicalText: vi.fn(async () => ({
  text: 'Subjective: Client reported stress.\nObjective: Client practiced coping.\nInterventions: Skills coaching\nPlan: Practice weekly.', modelName: 'test', latencyMs: 1
})) }));
vi.mock('../../services/speechTranscription.service.js', () => ({ transcribeLongAudio: vi.fn(async () => 'Clinician dictated session notes.') }));
vi.mock('../../services/noteAidChartAudit.service.js', () => ({ logNoteAidChartEvent: vi.fn(async () => {}) }));

import Agency from '../../models/Agency.model.js';
import User from '../../models/User.model.js';
import ClinicalNoteDraft from '../../models/ClinicalNoteDraft.model.js';
import NoteAidAgencyCatalog from '../../models/NoteAidAgencyCatalog.model.js';
import { requireStaffCareEligibility } from '../../services/staffCareEligibility.service.js';
import { generateClinicalText } from '../../services/clinicalNoteWriter.service.js';
import { noteAidKnowledgeBaseOptions } from '../../services/clinicalKnowledgeBase.service.js';
import { createSessionPrivacyContext } from '../../services/sessionAiPrivacy.service.js';
import { transcribeLongAudio } from '../../services/speechTranscription.service.js';
import { maybeDecryptNotePayload } from '../../services/clinicalNoteCrypto.service.js';
import { logNoteAidChartEvent } from '../../services/noteAidChartAudit.service.js';
import {
  generateTherapyNotesQuickCopy, getTherapyNotesQuickCopyCatalog, listTherapyNotesQuickCopyNotes,
  getTherapyNotesQuickCopyNote, updateTherapyNotesQuickCopyNote, transcribeTherapyNotesQuickCopy
} from '../therapyNotesQuickGenerator.controller.js';
import { THERAPY_NOTES_QUICK_COPY_ID, readQuickCopyNote } from '../../utils/therapyNotesQuickGenerator.js';

const request = () => ({ user: { id: 501, role: 'staff' }, body: { agencyId: 6, quickCopyOnly: true,
  serviceCode: 'H0004', toolId: 'clinical_h0004_note', clientName: 'Jane Example',
  dateOfService: '2026-11-15', inputText: 'Jane Example practiced a coping skill.' }, query: {}, params: {} });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const rowFromInput = input => ({ id: 42, user_id: 501, agency_id: input.agencyId,
  client_id: input.clientId || null, clinical_session_id: input.clinicalSessionId || null,
  office_event_id: input.officeEventId || null, initials: input.initials || null,
  service_code: input.serviceCode || null, date_of_service: input.dateOfService,
  output_json: input.outputJson, input_text: input.inputText, created_at: '2026-11-15T12:00:00Z', updated_at: '2026-11-15T12:00:00Z' });
let saved;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64'));
  Agency.findById.mockResolvedValue({ id: 6, slug: 'nlu' });
  NoteAidAgencyCatalog.listSettings.mockResolvedValue([]); User.getAgencies.mockResolvedValue([{ id: 6 }]);
  ClinicalNoteDraft.create.mockImplementation(async input => { saved = rowFromInput(input); return saved; });
  ClinicalNoteDraft.findByIdForUser.mockImplementation(async ({draftId,userId}) => Number(draftId)===42 && Number(userId)===501 ? saved : null);
  ClinicalNoteDraft.updateForUser.mockImplementation(async ({patch}) => { saved = {...saved,...rowFromInput({agencyId:saved.agency_id,clientId:null,...patch})}; return saved; });
  ClinicalNoteDraft.listQuickCopyForUser.mockImplementation(async () => saved ? [saved] : []);
  saved = undefined;
});
afterEach(() => vi.unstubAllEnvs());

async function generated() {
  const req = request(), res = response(), next = vi.fn();
  await generateTherapyNotesQuickCopy(req, res, next);
  expect(next).not.toHaveBeenCalled();
  return { req, res, next };
}

describe('separate saved Therapy Notes generator', () => {
  it('makes H0004 available to staff without care, billing, or per-aid assignment requirements', async () => {
    const {req,res} = await generated();
    expect(requireStaffCareEligibility).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ quickCopyNoteId: 42, draftId: 42,
      note: expect.objectContaining({ clientName: 'Jane Example', dateOfService: '2026-11-15', toolId: 'clinical_h0004_note' }) }));
    expect(ClinicalNoteDraft.create).toHaveBeenCalledWith(expect.objectContaining({ allowReuse: false, userId: 501,
      agencyId: 6, clientId: null, clinicalSessionId: null, officeEventId: null, initials: null }));
    expect(logNoteAidChartEvent).toHaveBeenCalledWith(req, expect.objectContaining({ agencyId: 6, action: 'therapy_notes_generator_note_generated' }));
  });

  it('encrypts client names and narratives at rest and redacts the supplied name before AI', async () => {
    await generated();
    expect(saved.output_json).not.toContain('Jane Example');
    expect(saved.input_text).not.toContain('Jane Example');
    const envelope = JSON.parse(saved.output_json);
    expect(envelope).toMatchObject({_enc:true,_quickCopy:true});
    expect(JSON.parse(maybeDecryptNotePayload(saved.output_json)).meta.clientName).toBe('Jane Example');
    expect(createSessionPrivacyContext).toHaveBeenCalledWith(expect.objectContaining({ identifiers:['Jane Example'],clientNames:['Jane Example'] }));
    expect(generateClinicalText.mock.calls[0][0].prompt).not.toContain('Jane Example');
    expect(JSON.stringify(logNoteAidChartEvent.mock.calls[0][1])).not.toContain('Jane Example');
  });

  it('passes the selected family service code and date into the trained prompt without billing validation',async()=>{
    const req=request(),res=response();req.body.toolId='clinical_family_note';req.body.serviceCode='90846';
    await generateTherapyNotesQuickCopy(req,res,vi.fn());
    expect(generateClinicalText.mock.calls[0][0].prompt).toContain('Selected documentation service code: 90846');
    expect(generateClinicalText.mock.calls[0][0].prompt).toContain('Date of service supplied by clinician: 2026-11-15');
    expect(requireStaffCareEligibility).not.toHaveBeenCalled();
  });

  it('preserves configured knowledge-base folder overrides and extra learning folders',async()=>{
    Agency.findById.mockResolvedValue({id:6,slug:'nlu',feature_flags:{noteAidKbFolderOverrides:{clinical_h0004_note:['H0004_approved']},noteAidKbExtraFolders:['shared_extra']}});
    await generated();
    expect(noteAidKnowledgeBaseOptions).toHaveBeenCalledWith(expect.objectContaining({folders:['H0004_approved','shared_extra'],codeHints:['H0004']}));
  });

  it('returns the full active trained catalog including H0004, plans, diagnosis, and termination', async () => {
    const res = response(); await getTherapyNotesQuickCopyCatalog(request(),res,vi.fn());
    const tools = res.json.mock.calls[0][0].tools;
    for(const id of ['clinical_h0004_note','clinical_psychotherapy_plan','clinical_diagnosis_writer','clinical_termination'])expect(tools.some(tool=>tool.id===id)).toBe(true);
    expect(tools.find(tool=>tool.id==='clinical_h0004_note').serviceCodes).toEqual(['H0004']);
    expect(tools.some(tool=>tool.id==='clinical_90791_note_aid')).toBe(false);
    expect(tools.some(tool=>Object.hasOwn(tool,'systemPrompt'))).toBe(false);
    expect(requireStaffCareEligibility).not.toHaveBeenCalled();
  });

  it.each(['clinical_psychotherapy_plan','clinical_diagnosis_writer','clinical_termination'])('allows %s without a service code or attached chart',async toolId=>{
    const req=request(),res=response();req.body.toolId=toolId;delete req.body.serviceCode;
    await generateTherapyNotesQuickCopy(req,res,vi.fn());
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({quickCopyNoteId:42}));
  });

  it('reopens and lists only the caller’s own unlinked notes in this organization',async()=>{
    await generated();
    const req=request(),res=response();req.params.id='42';
    await getTherapyNotesQuickCopyNote(req,res,vi.fn());
    expect(res.json).toHaveBeenCalledWith({note:expect.objectContaining({id:42,clientName:'Jane Example',inputText:'Jane Example practiced a coping skill.'})});
    const list=response();await listTherapyNotesQuickCopyNotes(req,list,vi.fn());
    expect(ClinicalNoteDraft.listQuickCopyForUser).toHaveBeenCalledWith({userId:501,agencyId:6});
    expect(list.json.mock.calls[0][0].notes[0]).toMatchObject({id:42,clientName:'Jane Example'});
    expect(list.json.mock.calls[0][0].notes[0]).not.toHaveProperty('outputJson');
    saved.agency_id=2;
    const foreign=response();await getTherapyNotesQuickCopyNote(req,foreign,vi.fn());expect(foreign.status).toHaveBeenCalledWith(404);
  });

  it('cannot open or replace a normal clinical draft by its ID',async()=>{
    saved={id:42,user_id:501,agency_id:6,client_id:null,output_json:JSON.stringify({sections:{Plan:'Original clinical note'}})};
    const req=request(),res=response();req.body.quickCopyNoteId=42;
    await generateTherapyNotesQuickCopy(req,res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);expect(generateClinicalText).not.toHaveBeenCalled();
    expect(ClinicalNoteDraft.updateForUser).not.toHaveBeenCalled();
  });

  it('saves edited section text encrypted and leaves every chart/session link empty',async()=>{
    await generated();const req=request(),res=response();req.params.id='42';req.body.sections={Subjective:'Clinician reviewed wording.'};
    await updateTherapyNotesQuickCopyNote(req,res,vi.fn());
    expect(res.json).toHaveBeenCalledWith({note:expect.objectContaining({outputJson:expect.objectContaining({sections:{Subjective:'Clinician reviewed wording.'}})})});
    expect(saved.output_json).not.toContain('Clinician reviewed wording.');expect(saved.client_id).toBeNull();
    expect(readQuickCopyNote(saved).clientName).toBe('Jane Example');
  });

  it('updates only a verified owned quick-copy note when regenerating',async()=>{
    await generated();const req=request(),res=response();req.body.quickCopyNoteId=42;
    await generateTherapyNotesQuickCopy(req,res,vi.fn());
    expect(ClinicalNoteDraft.create).toHaveBeenCalledTimes(1);expect(ClinicalNoteDraft.updateForUser).toHaveBeenCalledWith(expect.objectContaining({draftId:42,userId:501}));
  });

  it('enforces the disable switch before invoking AI or reading note content', async () => {
    NoteAidAgencyCatalog.listSettings.mockResolvedValue([{ catalog_aid_id: THERAPY_NOTES_QUICK_COPY_ID, enabled: 0 }]);
    const res = response();await generateTherapyNotesQuickCopy(request(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);expect(generateClinicalText).not.toHaveBeenCalled();expect(ClinicalNoteDraft.create).not.toHaveBeenCalled();
  });

  it.each(['clientId', 'clinicalSessionId', 'officeEventId', 'appointmentId', 'draftId'])('rejects inherited %s', async key => {
    const req=request(),res=response();req.body[key]=123;await generateTherapyNotesQuickCopy(req,res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);expect(generateClinicalText).not.toHaveBeenCalled();
  });

  it('preserves organization membership authorization and rejects non-staff accounts',async()=>{
    User.getAgencies.mockResolvedValueOnce([]);const res=response();await getTherapyNotesQuickCopyCatalog(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);
    const req=request(),family=response();req.user.role='client';await getTherapyNotesQuickCopyCatalog(req,family,vi.fn());expect(family.status).toHaveBeenCalledWith(403);
  });

  it('fails closed if secure note storage is not configured',async()=>{
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');const next=vi.fn(),res=response();
    await generateTherapyNotesQuickCopy(request(),res,next);expect(next).toHaveBeenCalled();expect(ClinicalNoteDraft.create).not.toHaveBeenCalled();
  });

  it('accepts clinician dictation only, without restoring ambient session recording',async()=>{
    const req=request(),res=response();req.body.recordingPurpose='dictation';req.file={buffer:Buffer.from('synthetic test audio'),mimetype:'audio/webm'};
    await transcribeTherapyNotesQuickCopy(req,res,vi.fn());expect(res.json).toHaveBeenCalledWith(expect.objectContaining({transcript:'Clinician dictated session notes.'}));
    expect(requireStaffCareEligibility).not.toHaveBeenCalled();
    req.body.recordingPurpose='session';const session=response();await transcribeTherapyNotesQuickCopy(req,session,vi.fn());expect(session.status).toHaveBeenCalledWith(400);expect(transcribeLongAudio).toHaveBeenCalledTimes(1);
  });
});
