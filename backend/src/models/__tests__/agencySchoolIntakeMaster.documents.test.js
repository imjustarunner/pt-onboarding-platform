import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
mock.module('../DocumentTemplate.model.js',{defaultExport:{findById:async id=>({
  1:{id:1,is_active:1,agency_id:5},2:{id:2,is_active:1,agency_id:6},
  3:{id:3,is_active:1,agency_id:null,organization_id:null},4:{id:4,is_active:0,agency_id:5},
  5:{id:5,is_active:1,agency_id:5,is_user_specific:1}
})[id]}});
const {resolveMasterDocumentIds}=await import('../AgencySchoolIntakeMaster.model.js');
const {default:pool}=await import('../../config/database.js');
const step=id=>({type:'document',templateId:id});
test('inherits selected agency and platform documents without a per-school allowlist',async()=>{
 assert.deepEqual(await resolveMasterDocumentIds([step(1),step(3),step(1)],5),[1,3]);
 assert.deepEqual(await resolveMasterDocumentIds([{type:'smart_disclosure'}],5),[]);
});
test('refuses other agencies, inactive, missing, and personnel documents',async()=>{
 for(const id of [2,4,5,99])await assert.rejects(resolveMasterDocumentIds([step(id)],5),{status:409});
});
after(()=>pool.end());
