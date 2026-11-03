import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import {canViewDemoExchange,hasDemoExchangeEmail,isExampleEmail} from '../../utils/clientExchangeDemo.js';
import {isDemoExchangeClient,blockDemoExchangeEmail} from '../clientExchangeDemo.service.js';
beforeEach(()=>{vi.resetAllMocks();pool.execute.mockResolvedValue([[]]);});
it.each(['QA@EXAMPLE.COM','Demo <qa@example.com>','demo@example','qa@sub.example.com'])('recognizes reserved demo email %s',email=>expect(isExampleEmail(email)).toBe(true));
it.each(['real@example.com.evil.test','example.com@real.test','real@anotherexample.com','real@example.test','clinical note mentions @example.com'])('does not misclassify %s',email=>expect(isExampleEmail(email)).toBe(false));
it('uses email fields in saved preferences without treating narrative examples as identity',()=>{
 expect(hasDemoExchangeEmail({guardian:{email:'demo@example.com'}})).toBe(true);
 expect(hasDemoExchangeEmail({notes:'Discuss demo@example.com'})).toBe(false);
});
it.each(['provider','provider_plus','intern','supervisor','staff','clinical_practice_assistant','guardian'])('keeps demos hidden from %s',role=>expect(canViewDemoExchange(role)).toBe(false));
it.each(['admin','super_admin','support'])('allows authorized %s staff to inspect demo matching',role=>expect(canViewDemoExchange(role)).toBe(true));
it('checks current client and linked guardian identities within the exact client agency',async()=>{
 pool.execute.mockResolvedValue([[{id:3,email:'real@family.test',demo_guardian_email:1}]]);
 expect(await isDemoExchangeClient({clientId:3,agencyId:2})).toBe(true);
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('c.agency_id=?'),[3,2]);
 pool.execute.mockResolvedValue([[{id:4,email:'qa@example.com'}]]);
 expect(await isDemoExchangeClient({clientId:3,agencyId:2})).toBe(false);
 expect(await isDemoExchangeClient({client:{id:3,agency_id:2,email:'qa@example.com'}})).toBe(true);
});
it('blocks queued provider mail while allowing the dedicated staff-only report template',async()=>{
 pool.execute.mockImplementation(async sql=>sql.includes('FROM client_exchange_listings')?[[{client_id:3,agency_id:2}]]:[[{id:3,email:'qa@example.com'}]]);
 expect(await blockDemoExchangeEmail({templateType:'client_exchange_match',linkUrl:'https://app.test/client-exchange?listingId=44',agencyId:2})).toBe(true);
 expect(await blockDemoExchangeEmail({templateType:'client_exchange_shared',agencyId:2})).toBe(true);
 expect(await blockDemoExchangeEmail({templateType:'client_exchange_demo_audit',agencyId:2})).toBe(false);
});
it('does not classify a real client from demo provider addresses in organization settings or matching metadata',async()=>{
 pool.execute.mockResolvedValue([[{id:3,email:'real@family.test',demo_guardian_email:0}]]);
 expect(await isDemoExchangeClient({client:{id:3,agency_id:2,email:'real@family.test',
   organization_feature_flags:{qaSandbox:{exchangeProviders:[{email:'provider@example.com'}]}},
   intake_preferences_json:{preferredProvider:{email:'provider@example.com'},providerEmail:'provider@example.com'}}})).toBe(false);
});
