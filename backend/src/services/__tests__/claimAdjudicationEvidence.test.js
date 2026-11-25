import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../claimMdWorkflow.service.js',()=>({recordClaimEvent:vi.fn()}));
import {adjudicationFileType,uploadClaimAdjudicationEvidence,validateClaimAdjudicationEvidence,downloadClaimAdjudicationEvidence} from '../claimAdjudicationEvidence.service.js';
import {decryptFamilyBilling} from '../familyBillingEncryption.service.js';
const example=()=>({buffer:Buffer.from('%PDF-1.4\nSynthetic EOB test fixture'),originalname:'primary-eob.pdf'});
beforeEach(()=>{vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));});
function setup(){
 const rows=[],objects=new Map();
 const db={execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT id,agency_id'))return [[{id:11,agency_id:2,client_id:3,payer_sequence:1}]];
  if(sql.startsWith('INSERT INTO')){rows.push({id:args[0],agency_id:args[1],client_id:args[2],primary_claim_id:args[3],storage_key:args[4],content_sha256:args[5],metadata_encrypted:args[6],created_by_user_id:args[7]});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT storage_key'))return [[rows.find(row=>row.id===args[0])]];
  if(sql.includes('AND id IN'))return [rows.filter(row=>row.agency_id===args[0]&&row.primary_claim_id===args[1]&&row.client_id===args[2]&&args.slice(3).includes(row.id))];
  return [rows];
 })};
 const storage={writeObject:vi.fn(async(key,b)=>objects.set(key,b)),readObject:vi.fn(async key=>objects.get(key)),deleteObject:vi.fn(async key=>objects.delete(key))};
 const record=vi.fn();return{db,storage,record,rows,objects};
}
describe('private primary adjudication proof',()=>{
 it('allows final responsibility proof on a secondary claim while keeping the primary-only upload restricted',async()=>{
  const d=setup(),original=d.db.execute.getMockImplementation();
  d.db.execute.mockImplementation((sql,args)=>sql.startsWith('SELECT id,agency_id')?[[{id:11,agency_id:2,client_id:3,payer_sequence:2,parent_claim_id:9}]]:original(sql,args));
  await expect(uploadClaimAdjudicationEvidence({agencyId:2,claimId:11,actorUserId:7,file:example(),kind:'primary_eob',source:'Payer portal'},d)).rejects.toMatchObject({status:404});
  const result=await uploadClaimAdjudicationEvidence({agencyId:2,claimId:11,actorUserId:7,file:example(),kind:'final_eob',source:'Final payer portal',finalAdjudication:true},d);
  expect(result.kind).toBe('final_eob');expect(d.record).toHaveBeenCalledWith(expect.objectContaining({eventType:'final_adjudication_proof_uploaded',actorUserId:7}),d.db);
  const downloaded=await downloadClaimAdjudicationEvidence({agencyId:2,claimId:11,evidenceId:result.id,actorUserId:7,finalAdjudication:true},d);expect(downloaded.buffer).toEqual(example().buffer);
 });
 it('stores encrypted bytes and metadata, records the actual actor, and validates an authenticated download',async()=>{
  const d=setup(),file=example(),result=await uploadClaimAdjudicationEvidence({agencyId:2,claimId:11,actorUserId:7,file,kind:'primary_eob',source:'Primary payer portal'},d);
  expect(d.storage.writeObject).toHaveBeenCalled();const stored=[...d.objects.values()][0];expect(stored.includes(file.buffer)).toBe(false);expect(stored.toString()).not.toContain('Synthetic EOB');expect(d.rows[0].metadata_encrypted).not.toContain('primary-eob.pdf');
  expect(d.record).toHaveBeenCalledWith(expect.objectContaining({actorUserId:7,eventType:'primary_adjudication_proof_uploaded',payload:expect.objectContaining({evidenceId:result.id})}),d.db);
  const downloaded=await downloadClaimAdjudicationEvidence({agencyId:2,claimId:11,evidenceId:result.id,actorUserId:8},d);expect(downloaded.buffer).toEqual(file.buffer);expect(downloaded.filename).toBe('primary-eob.pdf');
  expect(decryptFamilyBilling(d.rows[0].metadata_encrypted,`claim-adjudication:2:11:${result.id}:metadata`).source).toBe('Primary payer portal');
 });
 it('rejects cross-claim, cross-client and cross-organization proof IDs',async()=>{
  const d=setup(),file=await uploadClaimAdjudicationEvidence({agencyId:2,claimId:11,actorUserId:7,file:example(),kind:'primary_eob',source:'Primary payer portal'},d);
  for(const change of [{agencyId:9},{claimId:12},{clientId:4}])await expect(validateClaimAdjudicationEvidence({agencyId:2,claimId:11,clientId:3,evidenceIds:[file.id],...change},d.db)).rejects.toMatchObject({status:409});
  await expect(validateClaimAdjudicationEvidence({agencyId:2,claimId:11,clientId:3,evidenceIds:[]},d.db)).rejects.toMatchObject({status:409});
 });
 it('rejects MIME spoofing, executable formats, empty and oversized files',()=>{
  for(const file of [{buffer:Buffer.from('<html>bad</html>'),originalname:'proof.pdf'},{buffer:Buffer.from('%PDF-1.4'),originalname:'proof.svg'},{buffer:Buffer.alloc(0),originalname:'proof.pdf'},{buffer:Buffer.alloc(10*1024*1024+1),originalname:'proof.pdf'}])expect(()=>adjudicationFileType(file)).toThrow();
  expect(adjudicationFileType({buffer:Buffer.from('ISA*00~ST*835*0001~'),originalname:'remit.835'})).toBe('application/edi-x12');
 });
 it('fails an altered file integrity check and cleans only an unpersisted object after a database failure',async()=>{
  const d=setup(),proof=await uploadClaimAdjudicationEvidence({agencyId:2,claimId:11,actorUserId:7,file:example(),kind:'primary_eob',source:'Portal'},d);
  d.rows[0].content_sha256='0'.repeat(64);await expect(downloadClaimAdjudicationEvidence({agencyId:2,claimId:11,evidenceId:proof.id,actorUserId:8},d)).rejects.toMatchObject({status:409});
  const fail=setup(),prior=fail.db.execute.getMockImplementation();fail.db.execute.mockImplementation((sql,args)=>sql.startsWith('INSERT INTO')?Promise.reject(Error('Database unavailable')):prior(sql,args));
  await expect(uploadClaimAdjudicationEvidence({agencyId:2,claimId:11,actorUserId:7,file:example(),kind:'primary_eob',source:'Portal'},fail)).rejects.toThrow('Database unavailable');expect(fail.storage.deleteObject).toHaveBeenCalledOnce();expect(fail.record).not.toHaveBeenCalled();
 });
});
