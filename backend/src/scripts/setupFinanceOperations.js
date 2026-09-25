#!/usr/bin/env node
import pool from '../config/database.js';
import {assertFamilyBillingEncryption} from '../services/familyBillingEncryption.service.js';
import {enableFinanceOrganization} from '../services/finance/setup.js';
import {seedFinanceDemo} from '../services/finance/demo.js';

// User-authorized initial rollout. Run without --apply to inspect the target agencies.
try {
 const [agencies]=await pool.execute("SELECT id,name,slug FROM agencies WHERE slug IN ('plottwistco','mh4kidz') AND is_active=1");
 const manager=agencies.find(a=>a.slug==='plottwistco'),managed=agencies.find(a=>a.slug==='mh4kidz');
 if(!manager||!managed)throw Error('Expected active PlotTwistCo and MH4Kidz organizations were not found');
 assertFamilyBillingEncryption();
 console.log(JSON.stringify({database:process.env.DB_NAME,manager,managed,demo:'rocky-mountain-mentors-demo',bankConnections:'remain off',apply:process.argv.includes('--apply')}));
 if(process.argv.includes('--apply')){
  await enableFinanceOrganization({agencyId:manager.id});
  await enableFinanceOrganization({agencyId:managed.id,managerAgencyId:manager.id});
  console.log(JSON.stringify(await seedFinanceDemo({managerAgencyId:manager.id})));
 }
} catch(e){console.error(e.message);process.exitCode=1;}finally{await pool.end();}
