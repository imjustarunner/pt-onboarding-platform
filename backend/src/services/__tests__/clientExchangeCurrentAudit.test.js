import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),client:vi.fn(),listing:vi.fn(),candidates:vi.fn(),evaluate:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.client}}));
vi.mock('../clientExchange.service.js',()=>({getListingForMatching:m.listing}));
vi.mock('../clientExchangeCandidates.service.js',()=>({loadExchangeCandidates:m.candidates,evaluateExchangeCandidate:m.evaluate}));
import {currentExchangeAudit} from '../clientExchangeCurrentAudit.service.js';
const provider={id:1433,role:'provider',email:'qa.provider.auricwell@example.com',is_demo:1,first_name:'QA',last_name:'Provider'};
const original={listingId:12,run:{evaluated_at:'2026-10-26'},providers:[{userId:1433,matched:false,checks:[{field:'format',status:'fail'}],emailDelivery:{status:'not_sent'},smsDelivery:{status:'not_sent'},views:2}]};
beforeEach(()=>{
 vi.clearAllMocks();
 m.agency.mockResolvedValue({id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviderUserId:1433,exchangeProviders:[{id:1433,email:provider.email}]}}});
 m.client.mockResolvedValue({id:2264,agency_id:450});
 m.listing.mockResolvedValue({id:12,agencyId:450,clientId:2264,status:'open',notes:'Private narrative'});
 m.candidates.mockResolvedValue({users:[provider,{id:1,email:'real@example.test',role:'provider',is_demo:0}],facets:new Map()});
 m.evaluate.mockResolvedValue({matched:true,checks:[{field:'format',status:'pass',reason:'Virtual intake is open.'}]});
});
it('refreshes current fit without rewriting delivery receipts or returning clinical content',async()=>{
 const result=await currentExchangeAudit(original,450);
 expect(result.providers).toHaveLength(1);
 expect(result.providers[0]).toMatchObject({userId:1433,matched:true,emailDelivery:{status:'not_sent'},smsDelivery:{status:'not_sent'},views:2});
 expect(result.matchesEvaluatedAt).toBeTruthy();expect(result.run).toEqual(original.run);
 expect(original.providers[0].matched).toBe(false);
 expect(JSON.stringify(result)).not.toContain('Private narrative');
 expect(m.evaluate).toHaveBeenCalledTimes(1);
 expect(m.candidates).toHaveBeenCalledWith(450);
});
it('rejects another tenant before evaluating any candidates',async()=>{
 m.listing.mockResolvedValue({agencyId:2,clientId:1});
 await expect(currentExchangeAudit(original,450)).rejects.toMatchObject({status:403});
 expect(m.client).not.toHaveBeenCalled();expect(m.candidates).not.toHaveBeenCalled();
});
it('rejects a client whose agency no longer matches the listing',async()=>{
 m.client.mockResolvedValue({id:2264,agency_id:2});
 await expect(currentExchangeAudit(original,450)).rejects.toMatchObject({status:403});
 expect(m.candidates).not.toHaveBeenCalled();
});

it('omits inactive and demo providers from current results without deleting historical receipts', async () => {
 m.agency.mockResolvedValue({ id: 450, slug: 'live-agency' });
 const active = { id: 10, role: 'provider', first_name: 'Active' };
 m.candidates.mockResolvedValue({ users: [active, { id: 11, is_active: 0 }, { id: 12, status: 'TERMINATED' }, { id: 13, is_demo: 1 }], facets: new Map() });
 const result = await currentExchangeAudit(original, 450);
 expect(result.providers.map(p => p.userId)).toEqual([10]);
 expect(original.providers[0].emailDelivery).toEqual({ status: 'not_sent' });
 expect(m.evaluate).toHaveBeenCalledTimes(1);
});
