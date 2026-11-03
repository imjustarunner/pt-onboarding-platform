import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),main:vi.fn(),original:vi.fn(),policy:vi.fn(),copay:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.execute,getConnection:m.getConnection}}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main},onTableWrite:vi.fn()}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/clinicalNoteVersion.service.js',async original=>({...await original(),ensureOriginalRevision:m.original}));
vi.mock('../../services/supervisedBillingPolicy.service.js',async original=>({...await original(),resolveNoteDocumentationPolicy:m.policy}));
vi.mock('../../services/noteAidTermination.service.js',()=>({recordSignedTermination:vi.fn(),validateTermination:vi.fn(),validateTerminationContent:vi.fn()}));
vi.mock('../../services/familyLedger/copayAttendance.js',()=>({onSignedNoteCopay:m.copay}));
import {signClinicalNote} from '../medicalBilling.controller.js';
import {clinicalNoteSnapshotHash} from '../../services/clinicalNoteVersion.service.js';
let note,db,events;
const response=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
const request=()=>({user:{id:7,role:'provider'},params:{noteId:'444'},headers:{'user-agent':'Synthetic QA'},body:{agencyId:450,signingToken:clinicalNoteSnapshotHash(note,{}),accurateAndComplete:true,contentReviewConfirmed:true}});
beforeEach(()=>{
 vi.resetAllMocks();events=[];
 note={id:444,agency_id:450,client_id:2297,clinical_session_id:null,created_by_user_id:7,provider_signed_at:null,note_type:'TREATMENT_SUMMARY',note_payload:'DEMO QA reviewed summary',is_billable:0,metadata_json:{dateOfService:'2026-11-03'}};
 db={beginTransaction:vi.fn(async()=>events.push('begin')),commit:vi.fn(async()=>events.push('commit')),rollback:vi.fn(async()=>events.push('rollback')),release:vi.fn()};
 db.execute=vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT clinical_session_id'))return [[{clinical_session_id:null,agency_id:450}]];
  if(sql.startsWith('SELECT * FROM clinical_notes'))return [[structuredClone(note)]];
  if(sql.includes('SET provider_signed_at')){events.push('provider_signature');Object.assign(note,{provider_signed_at:new Date('2026-11-03T17:00:00Z'),provider_signed_by_user_id:args[1],content_hash:args[2],metadata_json:JSON.parse(args[3])});return [{affectedRows:1}];}
  return [[]];
 });
 m.getConnection.mockResolvedValue(db);m.execute.mockResolvedValue([[]]);m.main.mockResolvedValue([[]]);m.policy.mockResolvedValue({supervisorUserId:null,nonBillableReview:'none',noteTypes:[]});
 m.original.mockImplementation(async input=>{events.push('version_signature_audit');expect(input.db).toBe(db);expect(input.signatureEvent).toBe(true);expect(input.note.provider_signed_at).toBeTruthy();return {id:10,content_hash:'exact-version'};});
});
it('rejects the pre-race token after reading the current draft under its row lock',async()=>{
 const req=request();note.note_payload='DEMO QA changed by racing editor';const next=vi.fn(),res=response();await signClinicalNote(req,res,next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(db.execute.mock.calls.some(([sql])=>sql.includes('FOR UPDATE'))).toBe(true);expect(m.original).not.toHaveBeenCalled();expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalledOnce();
});
it('persists the signature, immutable snapshot and audit together before responding with server time',async()=>{
 const res=response(),next=vi.fn();await signClinicalNote(request(),res,next);expect(next).not.toHaveBeenCalled();expect(events).toEqual(['begin','provider_signature','version_signature_audit','commit']);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({signedAt:note.provider_signed_at,revisionId:10,revisionContentHash:'exact-version'}));expect(note.metadata_json.attestation.medicallyNecessary).toBe(false);
});
it('rolls back the clinical signature if immutable signature/audit persistence fails',async()=>{
 m.original.mockRejectedValue(new Error('Audit unavailable'));const next=vi.fn();await signClinicalNote(request(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({message:'Audit unavailable'}));expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();
});
it('rolls back and releases an early failed completion gate',async()=>{
 note.metadata_json.interactiveComplexityPending=true;const res=response();await signClinicalNote(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(400);expect(db.rollback).toHaveBeenCalledOnce();expect(db.release).toHaveBeenCalledOnce();expect(m.original).not.toHaveBeenCalled();
});
it('rejects nonclinical actors before opening a signing transaction',async()=>{
 const req=request();req.user.role='billing';const next=vi.fn();await signClinicalNote(req,response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.getConnection).not.toHaveBeenCalled();
});
