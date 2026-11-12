import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
import {saveCoverageReview,validateCoverageReview,syntheticQaCoverageReviewAvailable} from '../coverageVerification.service.js';
import {decryptFamilyBilling} from '../familyBillingEncryption.service.js';
const suite=recoveryMysqlEnabled?describe:describe.skip;
const insurance={primary:{insurerName:'Fictional QA Medicaid',memberId:'QA-ONLY-1112',isMedicaid:true},patient:{firstName:'Fictional',lastName:'Child'}};
const input={agencyId:450,clientId:10,actorUserId:559,serviceDate:'2026-11-12',status:'verified',source:'synthetic_qa',reference:'Owner-authorized fictional QA coverage review; no payer contact or actual benefits attested.',primaryChecked:true,otherCoverageChecked:true,orderConfirmed:true,medicaidTplChecked:true};
let m,db,deps;
suite('server-verified fictional QA coverage reviews',()=>{
 beforeAll(async()=>{vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,19).toString('base64'));m=await isolatedWorkflowMysql('coverage_synthetic_qa');db=m.db;
  await db.query('CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,is_demo TINYINT)');
  await db.query('CREATE TABLE agencies(id INT PRIMARY KEY,slug VARCHAR(100),feature_flags JSON,is_active TINYINT,is_archived TINYINT)');
  await db.query('CREATE TABLE client_coverage_reviews(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,client_id INT,service_date DATE,insurance_fingerprint VARCHAR(64),status VARCHAR(20),through_check_id INT,evidence_encrypted LONGTEXT,created_by_user_id INT,created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6))');
  await db.query('CREATE TABLE family_billing_audit(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,actor_user_id INT,client_id INT,action VARCHAR(80),object_id INT)');
  deps={pool:db,readInsurance:async()=>insurance,listEvidence:async()=>({checks:[],latestCheckId:0})};
 });
 afterAll(async()=>{if(m)await m.close();vi.unstubAllEnvs();});
 beforeEach(async()=>{await db.query('DELETE FROM clients');await db.query('DELETE FROM agencies');await db.query('DELETE FROM client_coverage_reviews');await db.query('DELETE FROM family_billing_audit');await db.execute('INSERT INTO clients VALUES(10,450,1)');await db.execute('INSERT INTO agencies VALUES(450,?,?,1,0)',['auricwell-qa-demo',JSON.stringify({qaSandbox:{syntheticOnly:true}})]);});
 it('saves explicitly fictional encrypted evidence and audit without payer verification claims',async()=>{
  expect(await syntheticQaCoverageReviewAvailable(input,db)).toBe(true);const saved=await saveCoverageReview(input,deps);const [[row]]=await db.execute('SELECT * FROM client_coverage_reviews WHERE id=?',[saved.id]);
  expect(saved.status).toBe('verified');expect(row.created_by_user_id).toBe(559);expect(row.evidence_encrypted).not.toContain(input.reference);
  expect(decryptFamilyBilling(row.evidence_encrypted,'coverage:450:10')).toMatchObject({source:'synthetic_qa',syntheticOnly:true,notPayerVerification:true,reference:input.reference});
  const [[audit]]=await db.execute('SELECT * FROM family_billing_audit');expect(audit).toMatchObject({agency_id:450,client_id:10,actor_user_id:559,action:'insurance_coordination_reviewed',object_id:saved.id});
 });
 it.each([
  ['non-demo child',"UPDATE clients SET is_demo=0"],
  ['missing QA flag',"UPDATE agencies SET feature_flags=JSON_OBJECT()"],
  ['string QA flag',`UPDATE agencies SET feature_flags=JSON_OBJECT('qaSandbox',JSON_OBJECT('syntheticOnly','true'))`],
  ['wrong slug',"UPDATE agencies SET slug='another-agency'"],
  ['archived QA agency',"UPDATE agencies SET is_archived=1"],
  ['inactive QA agency',"UPDATE agencies SET is_active=0"]
 ])('rejects %s even when request body claims Demo/syntheticOnly',async(_label,sql)=>{await db.query(sql);expect(await syntheticQaCoverageReviewAvailable(input,db)).toBe(false);await expect(saveCoverageReview({...input,is_demo:1,syntheticOnly:true,qaSandbox:{syntheticOnly:true}},deps)).rejects.toMatchObject({status:403});const [[row]]=await db.query('SELECT COUNT(*) AS total FROM client_coverage_reviews');expect(row.total).toBe(0);});
 it('rejects a different agency even when its name/flag and child are synthetic',async()=>{await db.query('UPDATE agencies SET id=451');await db.query('UPDATE clients SET agency_id=451');await expect(saveCoverageReview({...input,agencyId:451},deps)).rejects.toMatchObject({status:403});});
 it('keeps required fictional coverage checks and never trusts a pure validator caller by default',async()=>{expect(()=>validateCoverageReview(input,insurance)).toThrow();await expect(saveCoverageReview({...input,medicaidTplChecked:false},deps)).rejects.toMatchObject({status:409});});
});
