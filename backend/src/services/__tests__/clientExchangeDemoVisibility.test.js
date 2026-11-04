import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),client:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviders:[{id:1438,email:'qa.provider.supervisor@example.com'}]}}})}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.client}}));
vi.mock('../clientExchangeEligibility.service.js',()=>({loadExchangeProvider:async()=>({}),loadExchangeOpenings:vi.fn(),evaluateCurrentExchangeFit:vi.fn(),exchangeProviderAudit:vi.fn(),exchangeListingForEvaluation:v=>v,assertExchangeRequestEligible:vi.fn()}));
import {listListings,getListingById,getMatchingAudit,listMyRequests} from '../clientExchange.service.js';
const row={id:44,agency_id:2,client_id:3,posted_by_user_id:7,current_provider_user_id:7,status:'closed',demographics_json:{age:9},client_initials:'DEMO'};
beforeEach(()=>{
 vi.clearAllMocks();m.client.mockResolvedValue({id:3,agency_id:2,email:'demo@example.com'});
 m.execute.mockImplementation(async sql=>sql.includes('SELECT l.*')?[[row]]:sql.includes('SELECT r.*')?[[{id:9,listing_id:44,listing_client_id:3,listing_agency_id:2}]]:sql.startsWith('SELECT c.id,c.email')?[[{id:3,email:'demo@example.com'}]]:[[]]);
});
it.each(['provider','provider_plus','intern','supervisor','staff','clinical_practice_assistant'])('hides demo cards and direct links from %s even when assigned/posting',async viewerRole=>{
 const viewer={viewerUserId:7,viewerRole};
 expect(await listListings({agencyId:2,...viewer})).toEqual([]);
 expect(await getListingById(44,viewer)).toBeNull();
 expect(await getMatchingAudit(44,viewer)).toBeNull();
});
it.each(['admin','super_admin','support'])('retains staff demo cards and explicit labeling for %s',async viewerRole=>{
 expect(await getListingById(44,{viewerUserId:7,viewerRole})).toMatchObject({id:44,isDemo:true,canViewAudit:true});
});
it('hides historical provider requests for a now-demo listing',async()=>{
 expect(await listMyRequests({agencyId:2,requestingProviderUserId:7})).toEqual([]);
});
it('lets the QA exchange roster open synthetic demo referrals and still hides them from other providers',async()=>{
 const demo={...row,id:17,agency_id:450,status:'closed'};
 m.client.mockResolvedValue({id:3,agency_id:450,email:'family@example.com'});
 m.execute.mockImplementation(async sql=>sql.includes('SELECT l.*')?[[demo]]:sql.startsWith('SELECT c.id,c.email')?[[{id:3,email:'family@example.com',demo_guardian_email:1}]]:sql.startsWith('SELECT id,email,role,is_demo')?[[{id:1438,email:'qa.provider.supervisor@example.com',role:'provider',is_demo:1}]]:[[]]);
 expect((await listListings({agencyId:450,viewerUserId:1438,viewerRole:'provider'})).map(item=>item.id)).toEqual([17]);
 m.execute.mockImplementation(async sql=>sql.includes('SELECT l.*')?[[demo]]:sql.startsWith('SELECT c.id,c.email')?[[{id:3,email:'family@example.com',demo_guardian_email:1}]]:sql.startsWith('SELECT id,email,role,is_demo')?[[{id:9,email:'qa.provider.other@example.com',role:'provider',is_demo:1}]]:[[]]);
 expect(await listListings({agencyId:450,viewerUserId:9,viewerRole:'provider'})).toEqual([]);
});
