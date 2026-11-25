import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import {randomBytes} from 'node:crypto';
import {maybeDecryptNotePayload, maybeEncryptNotePayload} from '../../services/clinicalNoteCrypto.service.js';
import {excludeFamilyClinicalWorkspace, excludeSupportClinicalContent} from '../../middleware/supportContentAccess.middleware.js';

const db=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn()}));
const care=vi.hoisted(()=>vi.fn());
const audit=vi.hoisted(()=>vi.fn());
const findDraft=vi.hoisted(()=>vi.fn());
vi.mock('../../config/clinicalDatabase.js',()=>({default:db}));
vi.mock('../../models/ClinicalNoteDraft.model.js',()=>({default:{findByIdForUser:findDraft}}));
vi.mock('../../services/narrivaAccess.service.js',()=>({
  requireNarrivaClient:vi.fn(), narrivaError:(status,message)=>Object.assign(new Error(message),{status})
}));
vi.mock('../../services/staffCareEligibility.service.js',()=>({requireStaffCareEligibility:care}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:audit}));
import {listEntries, readEntry, createEntry} from '../confidentialClinicalEntries.controller.js';

const body='Synthetic private observation';
const requestKey='c6fab197-896a-4269-a7c9-a89be61090fa';
function request(query={},payload={}) {
  return {user:{id:5,role:'provider'},query:{agencyId:3,...query},params:{clientId:4,entryId:7},body:payload};
}
async function invoke(handler,req) {
  const response={set:vi.fn(),json:vi.fn(),status:vi.fn().mockReturnThis()};
  const next=vi.fn();
  await handler(req,response,next);
  return {response,next};
}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',randomBytes(32).toString('base64'));
});
afterEach(()=>vi.unstubAllEnvs());

describe('confidential clinical documentation',()=>{
  it.each(['guardian','client_guardian','client','support'])('rejects the %s content route before reading any entries',async role=>{
    const handler=role==='support'?excludeSupportClinicalContent:excludeFamilyClinicalWorkspace;
    const {response,next}=await invoke(handler,{user:{role}});
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it('requires the attestation and limits each attached draft to the same author, client and agency',async()=>{
    const unconfirmed=await invoke(createEntry,request({},{body,requestKey,attested:false}));
    expect(unconfirmed.next.mock.calls[0][0].status).toBe(400);
    findDraft.mockResolvedValue({agency_id:99,client_id:4,clinical_session_id:30});
    const foreign=await invoke(createEntry,request({draftId:11},{body,requestKey,attested:true}));
    expect(findDraft).toHaveBeenCalledWith({draftId:11,userId:5});
    expect(foreign.next.mock.calls[0][0].status).toBe(404);
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('encrypts the text and attestation together and audits the save before commit',async()=>{
    const tx={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn()};
    db.getConnection.mockResolvedValue(tx);
    let stored;
    tx.execute.mockImplementation(async(sql,values)=>{
      if(sql.startsWith('INSERT')){
        expect(sql).toContain('clinical_confidential_entries');
        expect(values.slice(0,7)).toEqual([3,4,5,null,null,null,requestKey]);
        stored=values[7];return [{}];
      }
      return [[{id:7,agency_id:3,client_id:4,body_encrypted:stored}]];
    });
    const {response}=await invoke(createEntry,request({},{body,requestKey,attested:true}));
    expect(stored).not.toContain(body);
    expect(JSON.parse(maybeDecryptNotePayload(stored))).toEqual({body,attestation:expect.stringContaining('harm')});
    expect(audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({required:true,targetId:7}));
    expect(JSON.stringify(audit.mock.calls[0][1])).not.toContain(body);
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(response.json).toHaveBeenCalledWith({id:7});
    audit.mockRejectedValue(new Error('Audit offline'));
    const denied=await invoke(createEntry,request({},{body,requestKey,attested:true}));
    expect(denied.response.json).not.toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalledOnce();
  });
  it('finds a draft addendum after signing by exact draft and session, without listing its body',async()=>{
    db.execute.mockResolvedValueOnce([[{clinical_session_id:30,metadata_json:{draftId:11}}]])
      .mockResolvedValueOnce([[{id:7,draft_id:11,created_at:'2026-01-01'}]]);
    const {response}=await invoke(listEntries,request({noteId:15}));
    expect(db.execute.mock.calls[0][1]).toEqual([15,3,4,5]);
    expect(db.execute.mock.calls[1][1]).toEqual([3,4,5,15,11,30]);
    expect(response.json).toHaveBeenCalledWith({entries:[{id:7,createdAt:'2026-01-01',kind:'addendum'}]});
  });
  it('scopes individual reads and fails closed if auditing is unavailable',async()=>{
    db.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{body_encrypted:maybeEncryptNotePayload(JSON.stringify({body}))}]]);
    const foreign=await invoke(readEntry,request());
    expect(db.execute.mock.calls[0][1]).toEqual([7,3,4,5]);
    expect(foreign.next.mock.calls[0][0].status).toBe(404);
    audit.mockRejectedValue(new Error('Audit offline'));
    const failed=await invoke(readEntry,request());
    expect(failed.response.json).not.toHaveBeenCalled();
    expect(failed.response.set).toHaveBeenCalledWith('Cache-Control','private, no-store');
  });
});
