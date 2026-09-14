import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import {publicCoachingCatalog} from '../publicCoachingCatalog.service.js';
import {isIndependentPracticeOwner} from '../../utils/independentPracticeOwner.js';
import {isCoachingIntakeLink,linkLooksLikeOfficeIntake} from '../../utils/officeIntakeLink.js';
import {hydrateOfficeQuestionnaireSteps} from '../../utils/officeQuestionnaireSteps.js';
import {kimiDocuments,kimiPackages} from '../../seeds/kimiContent.js';
const originalExecute=pool.execute,originalList=BookingPackage.listForAgency;
after(async()=>{pool.execute=originalExecute;BookingPackage.listForAgency=originalList;await pool.end();});
test('coaching intake does not inherit office clinical questionnaires',()=>{
 const link={scope_type:'agency',form_type:'intake',custom_messages:{serviceScope:'coaching'}};
 const steps=kimiDocuments.map((d,i)=>({id:`doc-${i}`,type:'document',templateId:i+1}));
 assert.equal(isCoachingIntakeLink(link),true);assert.equal(linkLooksLikeOfficeIntake(link),false);
 assert.deepEqual(hydrateOfficeQuestionnaireSteps(steps,{isOffice:linkLooksLikeOfficeIntake(link)}),steps);
 assert.equal(linkLooksLikeOfficeIntake({...link,custom_messages:{}}),true);
 assert.equal(isCoachingIntakeLink({...link,custom_messages:JSON.stringify(link.custom_messages)}),true);
});
test('public package catalog requires exactly one published coaching source',async()=>{
 for(const rows of [[],[{id:432},{id:6}]]){pool.execute=async()=>[rows];BookingPackage.listForAgency=async()=>{throw Error('must not read packages');};assert.equal(await publicCoachingCatalog('kimi'),null);}
});
test('public package catalog is tenant scoped and exposes no staff pay or private packages',async()=>{
 pool.execute=async(sql,args)=>{assert(sql.includes("a.organization_type='life_coach'"));assert.deepEqual(args,['kimi']);return[[{id:432,account_owner_user_id:532}]];};
 BookingPackage.listForAgency=async aid=>{assert.equal(aid,432);return[{id:1,businessType:'coaching',isActive:true,isPublic:false},{id:2,businessType:'counseling',isActive:true,isPublic:true},{id:3,businessType:'coaching',isActive:false,isPublic:true}];};
 assert.deepEqual(await publicCoachingCatalog('kimi'),{packages:[]});
});
test('practice ownership checks membership and exact active tenant, not global provider role',async()=>{
 let calls=0;pool.execute=async(sql,args)=>{calls++;assert(sql.includes('JOIN user_agencies'));assert(sql.includes('a.account_owner_user_id = ?'));assert(sql.includes("('life_coach', 'consultant')"));return [args[0]===432&&args[1]===532?[{id:432}]:[]];};
 assert.equal(await isIndependentPracticeOwner(532,432),true);assert.equal(await isIndependentPracticeOwner(532,6),false);assert.equal(await isIndependentPracticeOwner(999,432),false);assert.equal(await isIndependentPracticeOwner(532,NaN),false);assert.equal(calls,3);
});
test('seeded coaching packages retain distinct durations and original consent documents',()=>{
 assert.deepEqual(kimiPackages.map(p=>[p.sessions,p.minutes]),[[1,90],[3,60],[6,60],[1,30]]);
 assert.equal(kimiDocuments.length,3);assert(kimiDocuments.every(d=>d.sections.length>3));
});
