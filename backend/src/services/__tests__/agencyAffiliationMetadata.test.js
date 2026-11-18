import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {attachAgencyAffiliationMetadata} from '../agencyAffiliationMetadata.service.js';

it('enriches many memberships with a fixed number of scoped batch queries',async()=>{
 const orgs=Array.from({length:50},(_,i)=>({id:i+10,organization_type:'school'}));
 const database={execute:vi.fn(async sql=>[sql.includes('information_schema')?[{cnt:1}]:sql.includes('FROM organization_affiliations')?orgs.map(o=>({organization_id:o.id,agency_id:2})):[{id:2,slug:'test',color_palette:{primary:'blue'},theme_settings:{font:'test'}}]])};
 const affiliations={batchAgencyClinicalLearningFlags:vi.fn().mockResolvedValue(new Map([[2,{hasClinicalOrg:true,hasLearningOrg:false}]]))};
 const result=await attachAgencyAffiliationMetadata(orgs,{database,affiliations});
 expect(database.execute).toHaveBeenCalledTimes(3);expect(affiliations.batchAgencyClinicalLearningFlags).toHaveBeenCalledExactlyOnceWith([2]);
 expect(database.execute.mock.calls[1][1]).toEqual(orgs.map(o=>o.id));
 expect(result.every(o=>o.affiliated_agency_id===2&&o.hasClinicalOrg&&!o.hasLearningOrg&&o.parent_slug==='test')).toBe(true);
 expect(database.execute.mock.calls[2][1]).toEqual([2]);
});
it('preserves child branding, the most recent affiliation, and clinical/learning distinctions',async()=>{
 const orgs=[{id:1,organization_type:'clinical',color_palette:{primary:'own'},theme_settings:{own:true}},{id:3,organization_type:'agency'}];
 const database={execute:vi.fn(async sql=>[sql.includes('information_schema')?[{cnt:1}]:sql.includes('FROM organization_affiliations')?[{organization_id:1,agency_id:3},{organization_id:1,agency_id:4}]:[{id:3,portal_url:'parent',color_palette:{primary:'parent'},theme_settings:{parent:true}}]])};
 const affiliations={batchAgencyClinicalLearningFlags:vi.fn().mockResolvedValue(new Map([[3,{hasClinicalOrg:false,hasLearningOrg:true}]]))};
 const result=await attachAgencyAffiliationMetadata(orgs,{database,affiliations});
 expect(result[0]).toMatchObject({affiliated_agency_id:3,hasClinicalOrg:true,hasLearningOrg:false,color_palette:{primary:'own'},theme_settings:{own:true},parent_slug:'parent'});
 expect(result[1]).toMatchObject({hasClinicalOrg:false,hasLearningOrg:true});
});
it('keeps optional metadata failure independent of the membership response',async()=>{
 const orgs=[{id:2,organization_type:'agency'}];
 expect(await attachAgencyAffiliationMetadata(orgs,{database:{execute:vi.fn().mockRejectedValue(new Error('Unavailable'))}})).toBe(orgs);
});
