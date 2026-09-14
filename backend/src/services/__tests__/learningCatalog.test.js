import test from 'node:test';import assert from 'node:assert/strict';
import {matchesGrade,normalizeLearningProfile,normalizeLearningInquiry,validateLearningCatalog,hourlyRate,pricePackage} from '../learningCatalog.js';
test('grade matching uses exact grades and expands ranges without matching 1 to 11',()=>{assert.equal(matchesGrade(['3–5'],'3'),true);assert.equal(matchesGrade(['9–12'],'1'),false);assert.equal(matchesGrade(['1-2'],'K'),false);assert.equal(matchesGrade(['Pre-K–K'],'Pre-K'),true);assert.equal(matchesGrade(['Pre-K–K'],'2'),false);assert.equal(matchesGrade(['3'],'3-5'),false);});
test('program approval is explicit and does not default to bridge',()=>{assert.deepEqual(normalizeLearningProfile().programs,['tutoring']);assert.throws(()=>normalizeLearningProfile({programs:['psychotherapy']}));});
test('hourly pricing inherits education tier and format with provider override',()=>{const catalog={rates:[{educationLevel:'master',service:'tutoring',format:'virtual',hourlyRateCents:6500}],packages:[]};assert.equal(hourlyRate(catalog,{educationLevel:'master'},'tutoring','virtual'),6500);assert.equal(hourlyRate(catalog,{educationLevel:'master'},'tutoring','in-person'),null);assert.equal(hourlyRate(catalog,{educationLevel:'master',rateOverrides:[{service:'tutoring',format:'virtual',hourlyRateCents:7000}]},'tutoring','virtual'),7000);});
test('package example six hour sessions at 57 dollars totals 342 dollars',()=>{const c=validateLearningCatalog({rates:[],packages:[{id:'six',name:'Six sessions',program:'tutoring',published:true,components:[{educationLevel:'master',service:'tutoring',format:'virtual',sessions:6,minutes:60,hourlyRateCents:5700}]}]});assert.equal(pricePackage(c,c.packages[0]).totalCents,34200);});
test('integrated package retains component formats and durations; missing rate prevents false total',()=>{const c={rates:[],packages:[]};const p={components:[{educationLevel:'bachelor',service:'skill-development',format:'small-group',sessions:4,minutes:90,hourlyRateCents:2000},{educationLevel:'master',service:'counseling',format:'in-person',sessions:2,minutes:60,hourlyRateCents:null}]};const priced=pricePackage(c,p);assert.equal(priced.components[0].totalCents,12000);assert.equal(priced.totalCents,null);});
test('invalid prices and duplicate rules are rejected',()=>{assert.throws(()=>validateLearningCatalog({rates:[{educationLevel:'master',service:'tutoring',format:'virtual',hourlyRateCents:-1}],packages:[]}));assert.throws(()=>normalizeLearningProfile({rateOverrides:[{service:'tutoring',format:'virtual',hourlyRateCents:1.5}]}));});
test('inquiry stores versioned observations without accepting arbitrary scores or package prices',()=>{const v=normalizeLearningInquiry({program:'bridge',grade:'3',reflectionVersion:'6-10',reflectionAnswers:{'6-10-1-1':3},packageSnapshot:{totalCents:1}});assert.equal(v.version,1);assert.equal(v.packageSnapshot,undefined);assert.throws(()=>normalizeLearningInquiry({program:'bridge',reflectionAnswers:{'parent-1-1':8}}));});

import {learningIntakeSteps} from '../learningIntakeSteps.js';
test('learning packet removes the counseling seed while retaining custom questions and agreements',()=>{
 const steps=[{id:'counseling_self_about_you'},{id:'counseling_self_safety'},{id:'counseling_couple_questionnaires'},{id:'custom-questions'},{id:'office_package_selection'},{type:'packet_informed_group_consent'}];
 assert.deepEqual(learningIntakeSteps(steps),[steps[0],steps[3],steps[5]]);
 assert.equal(steps.length,6);
});

const discountCatalog = () => validateLearningCatalog({rates:[{educationLevel:'master',service:'tutoring',format:'virtual',hourlyRateCents:6500}],packages:[{id:'six-discount',name:'Six sessions',program:'tutoring',published:true,components:[{service:'tutoring',format:'virtual',pricingMode:'provider-discount',discountPercent:10,sessions:6,minutes:60}]}]});
test('provider discount uses that provider’s effective hourly rate and preserves quote source',()=>{
 const c=discountCatalog(),p=c.packages[0];
 const quote=pricePackage(c,p,{tutoring:{providerId:7,profile:{educationLevel:'master'}}});
 assert.equal(quote.totalCents,35100);assert.equal(quote.components[0].hourlyRateCents,5850);assert.equal(quote.components[0].providerId,7);
 const overridden=pricePackage(c,p,{tutoring:{providerId:8,profile:{educationLevel:'master',rateOverrides:[{service:'tutoring',format:'virtual',hourlyRateCents:7000}]}}});
 assert.equal(overridden.totalCents,37800);
});
test('a provider is required for provider discounts, and a tutor cannot price counseling',()=>{
 const c=discountCatalog(),p=c.packages[0];assert.equal(pricePackage(c,p).totalCents,null);
 const mixed={...p,components:[...p.components,{...p.components[0],service:'counseling'}]};
 const quote=pricePackage(c,mixed,{tutoring:{providerId:7,profile:{educationLevel:'master'}}});
 assert.equal(quote.components[0].totalCents,35100);assert.equal(quote.components[1].totalCents,null);assert.equal(quote.totalCents,null);
 assert.equal(pricePackage(c,p,{tutoring:{providerId:7,profile:{educationLevel:'bachelor'}}}).totalCents,null);
});
test('discount validation prevents negative, excessive, nonnumeric and competing fixed prices',()=>{
 for(const discount of [-1,101,'10',NaN]){const c=discountCatalog();c.packages[0].components[0].discountPercent=discount;assert.throws(()=>validateLearningCatalog(c));}
 const c=discountCatalog();c.packages[0].components[0].hourlyRateCents=100;assert.throws(()=>validateLearningCatalog(c));
});
test('discounted hourly prices round to cents before session-duration totals',()=>{
 const c=discountCatalog();c.packages[0].components[0].minutes=45;
 const quote=pricePackage(c,c.packages[0],{tutoring:{providerId:7,profile:{rateOverrides:[{service:'tutoring',format:'virtual',hourlyRateCents:6543}]}}});
 assert.equal(quote.components[0].hourlyRateCents,5889);assert.equal(quote.totalCents,26501);
});
