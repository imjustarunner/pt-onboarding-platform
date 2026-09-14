import {test} from 'node:test';import assert from 'node:assert/strict';
import {calculateProviderPackagePrice,normalizePackagePricing,assertPackageProviderBinding,assertPackageExpiration} from '../bookingPackagePricing.js';
import {validateLearningCatalog,hourlyRate,learningStaffPay,publicLearningCatalog} from '../learningCatalog.js';
const pricing=normalizePackagePricing({mode:'provider-discount',discountPercent:10,minutes:60,format:'virtual'});
test('six hourly sessions at ten percent off provider fee; employee pay is independent',()=>{
 const catalog=validateLearningCatalog({rates:[],packages:[],tiers:[{id:'L5',name:'Specialist',fees:{virtual:6000,'in-person':6500},pay:{virtual:3200,'in-person':3500}}]});
 const profile={tierId:'L5',educationLevel:'master'};
 assert.equal(hourlyRate(catalog,profile,'tutoring','in-person'),6500);
 assert.equal(learningStaffPay(catalog,profile,'in-person'),3500);
 assert.equal(calculateProviderPackagePrice({rateCents:6500,sessionCount:6,pricing}).amountCents,35100);
 assert.equal(learningStaffPay(catalog,profile,'in-person'),3500);
 assert.equal(hourlyRate(catalog,profile,'counseling','virtual'),null);
 assert.equal(hourlyRate(catalog,{...profile,rateOverrides:[{service:'tutoring',format:'virtual',hourlyRateCents:7000}]},'tutoring','virtual'),7000);
 assert.equal(hourlyRate(catalog,profile,'tutoring','small-group'),null);
 assert.equal(JSON.stringify(publicLearningCatalog(catalog)).includes('3200'),false);
 assert.equal('pay' in publicLearningCatalog(catalog).tiers[0],false);
});
test('variable counts/durations and explicit zero rates; invalid or missing rates fail closed',()=>{
 assert.equal(calculateProviderPackagePrice({rateCents:4000,sessionCount:8,pricing:{...pricing,minutes:30}}).amountCents,14400);
 assert.equal(calculateProviderPackagePrice({rateCents:0,sessionCount:6,pricing}).amountCents,0);
 for(const rateCents of [null,undefined,-1,NaN])assert.throws(()=>calculateProviderPackagePrice({rateCents,sessionCount:6,pricing}));
 for(const discountPercent of [-1,101,NaN])assert.throws(()=>normalizePackagePricing({...pricing,discountPercent}));
});
test('purchased package cannot move to a different provider, service, duration or format',()=>{
 const snap={...pricing,providerId:7,tenantServiceId:9};const appt={providerUserId:7,tenantServiceId:9,startAt:'2026-09-14T10:00:00Z',endAt:'2026-09-14T11:00:00Z',modality:'TELEHEALTH'};
 assert.doesNotThrow(()=>assertPackageProviderBinding(snap,appt));
 for(const patch of [{providerUserId:8},{tenantServiceId:10},{modality:'IN_PERSON'},{endAt:'2026-09-14T11:30:00Z'}])assert.throws(()=>assertPackageProviderBinding(snap,{...appt,...patch}));
});
test('expiration uses session date even if completion is recorded later',()=>{
 const snap={policies:{expirationDays:30}};
 assert.doesNotThrow(()=>assertPackageExpiration(snap,'2026-09-01 12:00:00','2026-09-30T12:00:00Z'));
 assert.throws(()=>assertPackageExpiration(snap,'2026-09-01 12:00:00','2026-10-01T12:00:00Z'));
});
