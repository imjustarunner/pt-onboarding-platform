// Run with node --experimental-test-module-mocks --test; no database connection.
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
if(typeof mock.module!=='function'){
 test('server enrollment pricing (requires --experimental-test-module-mocks)',{skip:true},()=>{});
}else{
const catalog={rates:[{educationLevel:'master',service:'tutoring',format:'virtual',hourlyRateCents:6500}],packages:[{id:'six',name:'Six tutoring sessions',program:'tutoring',published:true,components:[{service:'tutoring',format:'virtual',pricingMode:'provider-discount',discountPercent:10,sessions:6,minutes:60}]}]};
const profile={educationLevel:'master',programs:['tutoring'],rateOverrides:[]};
const queries=[];
mock.module('../../config/database.js',{defaultExport:{execute:async(sql,args)=>{
 queries.push({sql,args});
 if(sql.includes('agency_learning_catalogs'))return [[{catalog_json:catalog}]];
 if(sql.includes('provider_tutoring_profiles'))return [args[0]===6&&Number(args[1])===7?[{subject_areas_json:['Math'],grade_levels_json:['3'],learning_settings_json:profile}]:[]];
 throw Error('Unexpected SQL');
}}});
const {resolveLearningInquiry,prepareLearningPacket}=await import('../learningEnrollment.service.js');
test('enrollment quote uses validated provider and server rates, discarding submitted prices',async()=>{
 const learning=await resolveLearningInquiry(6,{program:'tutoring',grade:'3',subject:'Math',packageId:'six',packageSnapshot:{totalCents:1}},7);
 assert.equal(learning.packageSnapshot.totalCents,35100);assert.equal(learning.packageSnapshot.components[0].providerId,7);
 assert.match(queries.at(-1).sql,/u\.is_active=1/);
 await assert.rejects(resolveLearningInquiry(6,{program:'tutoring',packageId:'six'},999),/does not match/);
 await assert.rejects(resolveLearningInquiry(6,{program:'tutoring',grade:'11',packageId:'six'},7),/does not match/);
 await assert.rejects(resolveLearningInquiry(6,{program:'bridge',packageId:'six'},7),/no longer available/);
});
test('no selected provider leaves a variable quote unpriced',async()=>{
 assert.equal((await resolveLearningInquiry(6,{program:'tutoring',packageId:'six'})).packageSnapshot.totalCents,null);
});
test('full enrollment snapshots the single shared provider against each learner',async()=>{
 const intake={responses:{submission:{learning:{program:'tutoring'},preferred_office_provider_ids:[7]},clients:[{learning:{program:'tutoring',grade:'3',subject:'Math',packageId:'six'}}]}};
 await prepareLearningPacket(intake,{organization_id:6,master_channel:'tutoring'});
 assert.equal(intake.responses.clients[0].learning.packageSnapshot.totalCents,35100);
});

}
