import {beforeEach,expect,it,vi}from'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),context:vi.fn(),cards:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../clientServiceEnrollment.service.js',()=>({guardianServiceContext:m.context}));
import{listBalances,listReceipts,guardianStatementPdf}from'../familyLedger/views.js';
import{listSplitRequests}from'../familyLedger/sharing.js';
import{guardianBillingNeeds}from'../familyLedger/needs.js';
vi.mock('../insuranceCards/service.js',()=>({listCardTasks:m.cards}));
vi.mock('../familyLedger/tasks.js',()=>({listPaymentTasks:async()=>[]}));
vi.mock('../familyBillingPolicy.service.js',async original=>({...await original(),requireStatementAccess:async()=>{}}));
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[]]);m.cards.mockResolvedValue([]);m.context.mockResolvedValue({service:{service_kind:'tutoring'}});});
it('scopes both balance and receipt reads to the authorized service within the chosen agency',async()=>{
 for(const read of [listBalances,listReceipts,listSplitRequests]){await read({agencyId:453,userId:1456,clientId:2271,serviceId:1043});const [sql,args]=m.execute.mock.calls.at(-1);expect(sql).toContain('r.service_domain IN (?,?)');expect(args.slice(0,4)).toEqual([453,'tutoring','learning',2271]);}
 expect(m.context).toHaveBeenCalledWith(expect.objectContaining({agencyId:453,clientId:2271,userId:1456,serviceId:1043,scope:null}));
});
it('rejects another family service before querying financial records',async()=>{
 m.context.mockRejectedValue(Object.assign(new Error('Service is unavailable'),{status:403}));await expect(listBalances({agencyId:453,userId:1456,clientId:2271,serviceId:9999})).rejects.toMatchObject({status:403});expect(m.execute).not.toHaveBeenCalled();
});
it('retains agency-wide aggregation when no selected service was requested',async()=>{
 await listBalances({agencyId:453,userId:1456});expect(m.context).not.toHaveBeenCalled();expect(m.execute.mock.calls[0][0]).not.toContain('r.service_domain IN');
});

it('keeps downloaded statements within the selected service as well as the visible list',async()=>{
 const result=await guardianStatementPdf({agencyId:453,userId:1456,clientId:2271,serviceId:1043});expect(result.subarray(0,4).toString()).toBe('%PDF');expect(m.execute.mock.calls.some(([sql,args])=>sql.includes('r.service_domain IN (?,?)')&&args.slice(0,4).join(',')==='453,tutoring,learning,2271')).toBe(true);
 await expect(guardianStatementPdf({agencyId:453,userId:1456,clientId:2271,serviceId:1043,receivableId:9999})).rejects.toMatchObject({status:404});
});

it('does not fetch or demand insurance cards for the selected tutoring service',async()=>{
 const result=await guardianBillingNeeds({agencyId:453,userId:1456,clientId:2271,serviceId:1043});expect(result.insuranceCards).toEqual([]);expect(m.cards).not.toHaveBeenCalled();
 await guardianBillingNeeds({agencyId:453,userId:1456,clientId:2271});expect(m.cards).toHaveBeenCalledTimes(1);
});
