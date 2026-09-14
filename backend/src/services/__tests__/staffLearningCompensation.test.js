import {test,mock} from 'node:test';import assert from 'node:assert/strict';
if(typeof mock.module!=='function'){test('staff learning compensation (module mocks)',{skip:true},()=>{});}else{
const writes=[];let committed=false;
const execute=async(sql,args)=>{
 if(sql.includes('SELECT catalog_json'))return [[{catalog_json:{tiers:[{id:'L3',name:'Professional Tutor',pay:{virtual:2300,'in-person':2500},fees:{virtual:4000,'in-person':4500}}]}}]];
 if(sql.startsWith('SELECT'))return [[]];writes.push({sql,args});return [{affectedRows:1}];
};
mock.module('../../config/database.js',{defaultExport:{execute,getConnection:async()=>({execute,beginTransaction:async()=>{},commit:async()=>{committed=true;},rollback:async()=>{},release:()=>{}})}});
mock.module('../../models/User.model.js',{defaultExport:{getAgencies:async()=>[{id:6}]}});
const {saveStaffLearningCompensation}=await import('../../controllers/staffLearningCompensation.controller.js');
const response=()=>({setHeader(){},json(v){this.data=v;return this;}});
test('dual-role assignment saves only learning profile and dated modality payroll rates',async()=>{
 const res=response();let error;
 await saveStaffLearningCompensation({user:{id:1,role:'admin'},params:{agencyId:'6',providerId:'7'},body:{tierId:'L3',effectiveStart:'2026-09-14'}},res,e=>{error=e;});
 assert.equal(error,undefined);assert.equal(committed,true);assert.equal(writes.length,3);
 assert.deepEqual(writes.filter(w=>w.sql.includes('payroll_rates')).map(w=>w.args),[[6,7,'TUTORING VIRTUAL',23,'2026-09-14'],[6,7,'TUTORING IN PERSON',25,'2026-09-14']]);
 assert.ok(writes.every(w=>!w.sql.includes('payroll_user_compensation_levels')&&!w.sql.includes('provider_public_service_enrollments')));
 assert.match(writes[0].sql,/ON DUPLICATE KEY UPDATE learning_settings_json=JSON_SET/);
});
test('provider cannot assign their own wages; impossible dates cannot save',async()=>{
 for(const [role,date] of [['provider','2026-09-14'],['admin','2026-02-30']]){let error;await saveStaffLearningCompensation({user:{id:7,role},params:{agencyId:'6',providerId:'7'},body:{tierId:'L3',effectiveStart:date}},response(),e=>{error=e;});assert.ok(error);}
 assert.equal(writes.length,3);
});
}
