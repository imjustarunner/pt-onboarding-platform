import {test,mock} from 'node:test';import assert from 'node:assert/strict';
if(typeof mock.module!=='function'){test('provider package checkout (module mocks)',{skip:true},()=>{});}else{
let assigned=true,rate={rateCents:6500,rateUnit:'hour'},queries=[];
const snapshot={mode:'provider-discount',providerId:7,tenantServiceId:3,sessionCount:6,amountCents:35100,policies:{bonusSessions:1,freeMisses:2}};
const execute=async(sql,args)=>{queries.push({sql,args});if(sql.includes('SELECT u.id'))return [assigned?[{id:7}]:[]];if(sql.includes('SELECT * FROM booking_package_entitlements'))return [[{id:9,client_id:4,package_id:1,payment_status:'PENDING',status:'PENDING',pricing_snapshot_json:snapshot}]];return [{affectedRows:1}];};
mock.module('../../config/database.js',{defaultExport:{execute,getConnection:async()=>({execute,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}})}});
mock.module('../../models/TenantService.model.js',{defaultExport:{findById:async(id,aid)=>id===3&&aid===6?{id:3,isActive:true,businessType:'tutoring',packageEligible:true,modality:'TELEHEALTH'}:null}});
mock.module('../selfPayRates.service.js',{namedExports:{resolveSelfPayQuote:async()=>rate}});
const {quoteBookingPackage}=await import('../bookingPackagePricing.service.js');
const {default:BookingPackage}=await import('../../models/BookingPackage.model.js');
const pkg={id:1,agencyId:6,isActive:true,businessType:'tutoring',sessionCount:6,allowedTenantServiceIds:[3],domainConfig:{pricing:{mode:'provider-discount',discountPercent:10,minutes:60,format:'virtual'}}};
test('server quotes only assigned staff and valid hourly services',async()=>{
 const quote=await quoteBookingPackage({agencyId:6,pkg,providerId:7});assert.equal(quote.amountCents,35100);
 await assert.rejects(quoteBookingPackage({agencyId:6,pkg}),/Select a provider/);
 await assert.rejects(quoteBookingPackage({agencyId:6,pkg,providerId:7,tenantServiceId:8}),/not available/);
 assigned=false;await assert.rejects(quoteBookingPackage({agencyId:6,pkg,providerId:7}),/not assigned/);assigned=true;
 rate={rateCents:6500,rateUnit:'session'};await assert.rejects(quoteBookingPackage({agencyId:6,pkg,providerId:7}),/hourly client fee/);
});
test('activation and credit ledger use purchased counts and allowances despite catalog edits',async()=>{
 BookingPackage.findById=async()=>({...pkg,sessionCount:20,policies:{bonusSessions:5,freeMisses:8}});BookingPackage.findEntitlementById=async()=>({id:9});queries=[];
 await BookingPackage.activateEntitlement({agencyId:6,clientId:4,packageId:1,entitlementId:9});
 const update=queries.find(q=>q.sql.startsWith('UPDATE booking_package_entitlements'));assert.deepEqual(update.args.slice(0,4),[6,7,1,2]);
 assert.equal(queries.find(q=>q.sql.includes("'PACKAGE_PURCHASE'")).args[3],6);
 assert.equal(queries.find(q=>q.sql.includes("'PACKAGE_ALLOWANCES'")).args[3],1);
 await assert.rejects(BookingPackage.activateEntitlement({agencyId:6,clientId:4,packageId:1}),/quoted purchase/);
});
}
