import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({clinical:vi.fn(),main:vi.fn(),getConnection:vi.fn(),load:vi.fn(),original:vi.fn(),approved:vi.fn(),append:vi.fn(),policy:vi.fn(),sync:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical,getConnection:m.getConnection}}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main},onTableWrite:vi.fn()}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/clinicalReviewDocument.service.js',()=>({loadReviewDocument:m.load}));
vi.mock('../../services/clinicalNoteVersion.service.js',async original=>({...await original(),ensureOriginalRevision:m.original,hasPendingRevision:vi.fn(async()=>false),appendOriginalSignature:m.append}));
vi.mock('../../services/clinicalNoteVersionBilling.service.js',async original=>({...await original(),getApprovedClinicalContext:m.approved}));
vi.mock('../../services/supervisedBillingPolicy.service.js',async original=>({...await original(),resolveNoteDocumentationPolicy:m.policy}));
vi.mock('../../services/clinicalSupervisorReview.service.js',async original=>({...await original(),reviewSnapshotToken:()=> 'current-snapshot',synchronizeSupervisorQueue:m.sync}));
vi.mock('../../services/assistantClinicalSourceChange.service.js',()=>({queueCommittedClinicalSourceChange:vi.fn()}));
import {cosignClinicalNote} from '../medicalBilling.controller.js';
let note,db;
const response=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
const request=()=>({user:{id:5102,role:'supervisor'},params:{noteId:'8401'},headers:{'user-agent':'Synthetic QA'},body:{agencyId:83,reviewSnapshotToken:'current-snapshot',contentHash:'reviewed-version',reviewedAndApproved:true}});
beforeEach(()=>{
 vi.clearAllMocks();
 note={id:8401,agency_id:83,client_id:4102,clinical_session_id:7301,created_by_user_id:5101,provider_signed_by_user_id:5101,provider_signed_at:'2026-11-17T20:00:00Z',note_type:'TREATMENT_SUMMARY',is_billable:0,note_payload:'Synthetic reviewed clinical summary',metadata_json:{},clinical_version_number:1};
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM clinical_sessions'))return [[{id:7301,agency_id:83,client_id:4102}]];
  if(sql.startsWith('UPDATE clinical_notes')){note.supervisor_cosigned_at='2026-11-17T21:00:00Z';note.supervisor_cosigned_by_user_id=args[0];note.metadata_json=JSON.parse(args[1]);return [{affectedRows:1}];}
  if(sql.startsWith('SELECT * FROM clinical_notes'))return [[note]];
  return [[]];
 })};
 m.getConnection.mockResolvedValue(db);m.clinical.mockResolvedValue([[note]]);
 m.main.mockImplementation(async sql=>sql.includes('MAX(risk_assessment_required)')?[[{required:1}]]:[[]]);
 m.load.mockImplementation(async()=>({row:note,session:{id:7301,agency_id:83},hash:'reviewed-version'}));
 m.original.mockResolvedValue({id:9401,content_hash:'reviewed-version'});m.approved.mockImplementation(async()=>({note,session:{id:7301,agency_id:83}}));
 m.policy.mockResolvedValue({supervisorUserId:5102});m.sync.mockResolvedValue(true);
});
it('blocks a new supervisor signature when risk was detected after the author signed and no valid assessment or bypass exists',async()=>{
 const next=vi.fn();await cosignClinicalNote(request(),response(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409,code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'}));
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clinical_notes'))).toBe(false);expect(m.append).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalledOnce();
});
it('allows standard supervisor approval once the actual required assessment is complete',async()=>{
 note.metadata_json={narrivaContext:{riskAssessmentIncluded:true,riskAssessmentCompleted:true},structuredChart:{riskAssessment:{patientDeniesAll:true}}};
 const next=vi.fn(),res=response();await cosignClinicalNote(request(),res,next);
 expect(next).not.toHaveBeenCalled();expect(m.append).toHaveBeenCalledOnce();expect(db.commit).toHaveBeenCalledOnce();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({noteId:8401,cosignedAt:expect.any(String)}));
});
it('returns an already-recorded supervisor receipt without creating a new signature or rewriting history',async()=>{
 note.supervisor_cosigned_at='2026-11-17T20:30:00Z';note.supervisor_cosigned_by_user_id=5102;
 const next=vi.fn(),res=response();await cosignClinicalNote(request(),res,next);
 expect(next).not.toHaveBeenCalled();expect(m.append).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({cosignedAt:'2026-11-17T20:30:00Z'}));
});
