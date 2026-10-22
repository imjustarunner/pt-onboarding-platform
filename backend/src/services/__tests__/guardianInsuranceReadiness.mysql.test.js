import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import {splitSqlStatements,stripSqlLineComments} from '../../../../database/migrationSqlUtils.js';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args),getConnection:()=>state.db.getConnection()}}));
vi.mock('../clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:async()=>{}}}));
import {saveFamilyInsurance,getFamilyBillingSummary} from '../familyBilling.service.js';
import {readClientInsurance} from '../clientInsurance.service.js';
import {cardContext,uploadCard} from '../insuranceCards/service.js';
import {cardCycle} from '../insuranceCards/policy.js';
import Profiles from '../../models/GuardianInsuranceProfile.model.js';
import {saveClientInsurance,getClientInsurance} from '../../controllers/clientInsurance.controller.js';

const socket=process.env.EVIDENCE_TEST_SOCKET;
describe.skipIf(!socket)('independent guardian policies with real SQL and encryption',()=>{
 const primary={insurerName:'First holder coverage',memberId:'SYNTHETIC-ONE',subscriberName:'First Parent',relationshipToSubscriber:'child'};
 const secondary={insurerName:'Second holder coverage',memberId:'SYNTHETIC-TWO',subscriberName:'Second Parent',relationshipToSubscriber:'child'};
 let first,second;
 beforeAll(async()=>{
  if(!/^\/private\/tmp\/pt-security-evidence-db\.[^/]+\/mysql\.sock$/.test(socket))throw Error('Use a disposable local test database');
  vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,5).toString('base64'));vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_ID','test');
  const root=await mysql.createConnection({socketPath:socket,user:'root'});await root.query('CREATE DATABASE guardian_insurance_readiness_test');await root.end();
  state.db=mysql.createPool({socketPath:socket,user:'root',database:'guardian_insurance_readiness_test',timezone:'Z',connectionLimit:4});
  let fixture=await fs.readFile(new URL('../../../fixtures/family-billing-security.sql',import.meta.url),'utf8');fixture=fixture.slice(fixture.indexOf('CREATE TABLE agencies'));
  const migrations=['613_guardian_insurance_payment.sql','1413_private_family_billing.sql','1687_dependent_portal_access.sql','1688_client_portal_independence.sql'];
  for(const statement of splitSqlStatements(stripSqlLineComments(fixture)))await state.db.query(statement);
  for(const name of migrations){const sql=await fs.readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');for(const statement of splitSqlStatements(stripSqlLineComments(sql)))await state.db.query(statement);}
  const followups=await fs.readFile(new URL('../../../../database/migrations/1640_insurance_followups_and_payer_shares.sql',import.meta.url),'utf8');
  for(const statement of splitSqlStatements(stripSqlLineComments(followups)).filter(s=>s.startsWith('CREATE TABLE')))await state.db.query(statement);
  await state.db.query("ALTER TABLE clients ADD date_of_birth DATE,ADD gender VARCHAR(20),ADD address_street VARCHAR(255),ADD address_apt VARCHAR(50),ADD address_city VARCHAR(50),ADD address_state VARCHAR(10),ADD address_zip VARCHAR(20),ADD status VARCHAR(20) DEFAULT 'ACTIVE',ADD compliance_archived_at DATETIME");
  await state.db.query("UPDATE clients SET date_of_birth='2017-02-03',gender='F',address_street='Original address'");
  await state.db.query('ALTER TABLE agencies ADD slug VARCHAR(80),ADD portal_url VARCHAR(255),ADD is_active BOOLEAN DEFAULT 1,ADD is_archived BOOLEAN DEFAULT 0');
  await state.db.query("ALTER TABLE users ADD email VARCHAR(255),ADD status VARCHAR(30) DEFAULT 'ACTIVE',ADD is_active BOOLEAN DEFAULT 1,ADD is_archived BOOLEAN DEFAULT 0");
  first=await saveFamilyInsurance({userId:10,agencyId:1,clientIds:[101],primary,coverageScope:'client',coverageConfirmed:true});
  second=await saveFamilyInsurance({userId:20,agencyId:1,clientIds:[101],primary:secondary,coverageScope:'client',coverageConfirmed:true});
 });
 afterAll(async()=>{if(state.db){await state.db.query('DROP DATABASE guardian_insurance_readiness_test');await state.db.end();}});
 it('accepts both holders without payer liability and keeps each policy private',async()=>{
  const [[count]]=await state.db.query('SELECT COUNT(*) n FROM client_billing_payers');expect(count.n).toBe(0);
  expect((await readClientInsurance(101,1)).primary.memberId).toBe(primary.memberId);
  const one=await getFamilyBillingSummary(10,1),two=await getFamilyBillingSummary(20,1);
  expect(one.profiles.map(p=>p.id)).toEqual([first]);expect(two.profiles.map(p=>p.id)).toEqual([second]);
  expect(two.clients.find(c=>c.clientId===101)).toMatchObject({canManageInsurance:true,canManageBilling:false,insuranceOnFile:true});
 });
 it('allows the second holder to upload their card before staff chooses billing order',async()=>{
  const context=await cardContext({agencyId:1,profileId:second,userId:20});const saved=[];
  const deps={storage:{getGCSBucket:async()=>({name:'synthetic-bucket',file:key=>({save:async(...args)=>saved.push({key,args})})})},crypto:{isConfigured:()=>true,encryptBuffer:async()=>({encryptedBuffer:Buffer.from('encrypted fixture'),encryptionKeyId:'fixture',encryptionWrappedKeyB64:'fixture',encryptionIvB64:'fixture',encryptionAuthTagB64:'fixture'})}};
  await uploadCard({agencyId:1,profileId:second,userId:20,slot:'primary_front',cycle:cardCycle(context.profile)},{mimetype:'application/pdf',originalname:'fixture.pdf',buffer:Buffer.from('%PDF-1.7 synthetic card')},deps);
  expect(saved).toHaveLength(1);expect((await Profiles.findByGuardian(20,1))[0].primary_card_front_url).toContain(`insurance-cards/1/${second}/`);
  await expect(cardContext({agencyId:1,profileId:second,userId:10})).rejects.toMatchObject({status:404});
 });
 it('lets billing staff see both submissions and swap coverage without editing identifying demographics',async()=>{
  const res={set:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();const req={user:{id:99},params:{clientId:101},query:{agencyId:1},body:{agencyId:1,primary:secondary,secondary:primary,coverageSources:{primary:{profileId:second,slot:'primary'},secondary:{profileId:first,slot:'primary'}},verifiedForClaims:true}};
  await getClientInsurance(req,res,next);expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].policies).toHaveLength(2);expect(res.json.mock.calls[0][0].policies.find(p=>p.id===second).cardEvidence.primary_front).toBe(true);
  await saveClientInsurance(req,res,next);expect(next).not.toHaveBeenCalled();const actual=await readClientInsurance(101,1);
  expect(actual).toMatchObject({primary:{memberId:secondary.memberId},secondary:{memberId:primary.memberId},coverageSources:req.body.coverageSources});
  const [[client]]=await state.db.query("SELECT DATE_FORMAT(date_of_birth,'%Y-%m-%d') dob,full_name,gender,address_street FROM clients WHERE id=101");expect(client).toEqual({dob:'2017-02-03',full_name:'Child One',gender:'F',address_street:'Original address'});
  expect((await cardContext({agencyId:1,profileId:first,userId:10})).clients).toHaveLength(1);expect((await cardContext({agencyId:1,profileId:second,userId:20})).clients).toHaveLength(1);
 });
 it('retains coordinated coverage if a holder edits their own submission and requires staff review again',async()=>{
  await saveFamilyInsurance({userId:20,agencyId:1,profileId:second,clientIds:[101],primary:{...secondary,memberId:'UPDATED-SYNTHETIC-TWO'},coverageScope:'client',coverageConfirmed:true});
  const canonical=await readClientInsurance(101,1);expect(canonical.primary.memberId).toBe(secondary.memberId);expect(canonical.secondary.memberId).toBe(primary.memberId);expect(canonical.verifiedForClaims).toBe(false);
 });
 it('rejects a profile from another client or tenant while preserving saved coverage',async()=>{
  const foreign=await Profiles.upsert({guardianUserId:20,agencyId:2,clientId:201,primary:secondary,createNew:true});
  const next=vi.fn(),res={set:vi.fn().mockReturnThis(),json:vi.fn()};await saveClientInsurance({user:{id:99},params:{clientId:101},body:{agencyId:1,primary,coverageSources:{primary:{profileId:foreign,slot:'primary'}}}},res,next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect((await readClientInsurance(101,1)).primary.memberId).toBe(secondary.memberId);
 });
});
