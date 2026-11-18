import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {plotlineDb} from './fixtures/plotlineDb.js';
import {createPlotlineCompanyPolicy} from '../plotlineCompanyPolicy.service.js';
let fixture,policy;
const request=(path,method='GET',body={})=>({originalUrl:path,method,body,query:{},headers:{},user:{id:1434,scopedAgencyId:463}});
beforeEach(()=>{
  fixture=plotlineDb();
  fixture.sql.exec(`INSERT INTO agencies(id,feature_flags) VALUES(463,'{"plotlineOnly":true}');
    INSERT INTO plotline_companies(agency_id,trial_started_at,trial_ends_at) VALUES(463,'2026-11-18T00:00:00Z','2026-12-18T00:00:00Z');
    CREATE TABLE hiring_job_descriptions(id INTEGER PRIMARY KEY,agency_id INTEGER);
    INSERT INTO hiring_job_descriptions VALUES(1,463),(2,464);
    CREATE TABLE intake_links(id INTEGER PRIMARY KEY,organization_id INTEGER,scope_type TEXT,form_type TEXT);
    INSERT INTO intake_links VALUES(10,463,'agency','job_application'),(11,464,'agency','job_application'),(12,463,'agency','intake');
    CREATE TABLE document_templates(id INTEGER PRIMARY KEY,agency_id INTEGER,is_user_specific INTEGER);
    INSERT INTO document_templates VALUES(20,463,0),(21,464,0),(22,463,1);`);
  policy=createPlotlineCompanyPolicy({db:fixture.db,now:()=>new Date('2026-11-18T17:00:00Z')});
});
afterEach(()=>fixture.close());
describe('Plotline job dependencies stay scoped to the chosen company',()=>{
  it.each(['/api/onboarding-packages','/api/document-templates'])('scopes the read catalog %s',async path=>{
    const req=request(path);await policy.assertRequest(req);
    expect(req.query.agencyId).toBe('463');expect(req.plotlineHiringAgencyId).toBe(463);
    await expect(policy.assertRequest(request(path,'POST'))).rejects.toMatchObject({code:'PLOTLINE_PRODUCT_BOUNDARY'});
    await expect(policy.assertRequest(request(path+'/archived'))).rejects.toMatchObject({code:'PLOTLINE_PRODUCT_BOUNDARY'});
  });
  it.each(['/api/presence/heartbeat','/api/presence/me','/api/presence/status/clear'])('allows the existing self-session operation %s',async path=>{
    await expect(policy.assertRequest(request(path,path.endsWith('/me')?'GET':'POST'))).resolves.toBeUndefined();
    await expect(policy.assertRequest(request('/api/presence/admin'))).rejects.toMatchObject({status:403});
  });
  it('allows own job form creation with no clinical provisioning',async()=>{
    const req=request('/api/intake-links/from-job/1','POST');await policy.assertRequest(req);
    expect(req.body).toMatchObject({formType:'job_application',organizationId:463,createClient:false,createGuardian:false});
    await expect(policy.assertRequest(request('/api/intake-links/from-job/2','POST'))).rejects.toMatchObject({status:403});
  });
  it('rejects foreign and clinical forms, translations and non-hiring conversions',async()=>{
    for(const path of ['/api/intake-links/11','/api/intake-links/12','/api/intake-links/10/linked-translation'])
      await expect(policy.assertRequest(request(path))).rejects.toMatchObject({status:403});
    for(const body of [{formType:'intake'},{organizationId:464},{createClient:true},{createGuardian:'true'},{linkedEsFormId:11},{scopeType:'school'},{jobDescriptionId:2},{allowedDocumentTemplateIds:[21]},{allowedDocumentTemplateIds:[22]}])
      await expect(policy.assertRequest(request('/api/intake-links/10','PUT',body))).rejects.toMatchObject({status:403});
    await expect(policy.assertRequest(request('/api/intake-links/10','PUT',{allowedDocumentTemplateIds:[20]}))).resolves.toBeUndefined();
  });
  it('denies conflicting explicit company and keeps expired trials read-only',async()=>{
    const req=request('/api/intake-links');req.query.agencyId=464;
    await expect(policy.assertRequest(req)).rejects.toMatchObject({code:'PLOTLINE_COMPANY_MISMATCH'});
    fixture.sql.exec("UPDATE plotline_companies SET trial_ends_at='2026-11-18T00:00:00Z'");
    await expect(policy.assertRequest(request('/api/intake-links/from-job/1','POST'))).rejects.toMatchObject({code:'PLOTLINE_TRIAL_ENDED'});
    await expect(policy.assertRequest(request('/api/intake-links'))).resolves.toBeUndefined();
  });
});
