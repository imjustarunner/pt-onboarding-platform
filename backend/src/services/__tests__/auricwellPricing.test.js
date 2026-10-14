import { describe,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { estimateAuricwell,quoteAuricwellSeats,AURICWELL_PLANS } from '../../constants/auricwellPricing.js';
import { validatePricingDraft,saveAuricwellPricingDraft } from '../auricwellPricing.service.js';
const admin={userId:1,category:'administrator',clinical:true};
const intern={userId:2,category:'supervised',clinical:true,signingProviderId:1,requiresCosign:true,billsUnderOtherLicense:true};
const roster=[{id:1,role:'admin'},{id:2,role:'provider'}];
describe('AuricWell role and usage pricing',()=>{
  it('includes one clinical administrator and all support without double charging roles',()=>{
    const q=quoteAuricwellSeats({tier:'basic',seats:[admin,{userId:2,category:'support',clinical:false}]});
    expect(q.subscriptionCents).toBe(4900);expect(q.clinicalSeats).toBe(1);
    expect(q.meters.find(m=>m.key==='video').included).toBe(600);
  });
  it.each([['basic',6900],['premium',12900],['premium_plus',18900]])('prices the explicitly supervised seat on %s', (tier,total)=>{
    expect(quoteAuricwellSeats({tier,seats:[admin,intern]}).totalCents).toBe(total);
  });
  it('charges additional admins once and independently billing supervisors at the provider rate',()=>{
    const q=quoteAuricwellSeats({tier:'premium',seats:[admin,{userId:2,category:'administrator',clinical:false},{userId:3,category:'independent',clinical:true}]});
    expect(q.totalCents).toBe(9900+7900+5900);
  });
  it('requires both supervised billing conditions and a different signer',()=>{
    for(const change of [{requiresCosign:false},{billsUnderOtherLicense:false},{signingProviderId:2},{signingProviderId:0}])expect(()=>quoteAuricwellSeats({tier:'basic',seats:[admin,{...intern,...change}]})).toThrow(/supervised seat/);
  });
  it('rejects duplicate people, clinical support and invalid quantities',()=>{
    expect(()=>quoteAuricwellSeats({tier:'basic',seats:[admin,admin]})).toThrow(/one seat/);
    expect(()=>quoteAuricwellSeats({tier:'basic',seats:[{userId:1,category:'support',clinical:true}]})).toThrow(/Clinical staff/);
    for(const value of [-1,0.5,NaN,Infinity,'2'])expect(()=>estimateAuricwell({tier:'basic',counts:{independent:value}})).toThrow();
  });
  it('pools practice and clinical allowances and rounds sub-cent video only on the total',()=>{
    const q=estimateAuricwell({tier:'basic',counts:{administrator:1,independent:1,support:30},usage:{video:603,sms:152,claims:21,eras:21,eligibility:11}});
    expect(q.meters.map(m=>m.overage)).toEqual([3,2,1,1,1]);
    expect(q.meters.map(m=>m.amountCents)).toEqual([4,6,60,60,60]);
    expect(q.totalCents).toBe(4900+3900+190);
  });
  it('never carries pools between estimates and includes zero-cost support',()=>{
    expect(estimateAuricwell({tier:'basic',counts:{support:100},usage:{video:301}}).meters[0].overage).toBe(1);
    expect(estimateAuricwell({tier:'basic',counts:{support:100}}).meters[0].included).toBe(300);
  });
  it('reports unknown vendor costs as unknown and shows a loss rather than hiding it',()=>{
    expect(estimateAuricwell({tier:'basic'}).contributionCents).toBeNull();
    expect(estimateAuricwell({tier:'basic',vendorCostsCents:7000}).contributionCents).toBe(-2100);
  });
  it('grows every allowance by tier',()=>{
    for(let i=1;i<AURICWELL_PLANS.length;i++)for(const key of ['video','sms','claims','eras','eligibility']){
      expect(AURICWELL_PLANS[i].included[key]).toBeGreaterThan(AURICWELL_PLANS[i-1].included[key]);
      expect(AURICWELL_PLANS[i].perClinicalSeat[key]).toBeGreaterThan(AURICWELL_PLANS[i-1].perClinicalSeat[key]);
    }
  });
});
describe('practice pricing draft safeguards',()=>{
  it('requires the active roster and an independently billing signing clinician',()=>{
    expect(validatePricingDraft({revision:0,tier:'basic',seats:[admin,intern]},roster).subscriptionCents).toBe(6900);
    expect(()=>validatePricingDraft({revision:0,tier:'basic',seats:[admin]},roster)).toThrow(/roster changed/);
    expect(()=>validatePricingDraft({revision:0,tier:'basic',seats:[{...admin,clinical:false},intern]},roster)).toThrow(/independently billing clinician/);
    expect(()=>validatePricingDraft({revision:0,tier:'basic',seats:[{...admin,category:'independent'},intern]},roster)).toThrow(/administrators/);
  });
  it('rolls back a stale edit and never writes a quote or activates billing',async()=>{
    const c={beginTransaction:vi.fn(),execute:vi.fn().mockResolvedValueOnce([[{id:5}]]).mockResolvedValueOnce([[{revision:2}]]),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
    await expect(saveAuricwellPricingDraft(5,1,{revision:1},{getConnection:async()=>c})).rejects.toMatchObject({status:409});
    expect(c.execute).toHaveBeenCalledTimes(2);expect(c.commit).not.toHaveBeenCalled();expect(c.rollback).toHaveBeenCalledOnce();expect(c.release).toHaveBeenCalledOnce();
  });
  it('stores a new immutable version with the reviewing actor and normalized inputs',async()=>{
    const c={beginTransaction:vi.fn(),execute:vi.fn().mockResolvedValueOnce([[{id:5}]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([roster]).mockResolvedValueOnce([{insertId:12}]),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
    const r=await saveAuricwellPricingDraft(5,99,{revision:0,tier:'basic',seats:[{...admin,name:'discard'},intern],unexpected:'discard'},{getConnection:async()=>c});
    expect(r).toMatchObject({revision:1,billingActivated:false});
    const values=c.execute.mock.calls[3][1];expect(values[5]).toBe(99);expect(JSON.parse(values[3]).seats[0]).not.toHaveProperty('name');expect(JSON.parse(values[4]).totalCents).toBe(6900);expect(c.commit).toHaveBeenCalledOnce();
  });
});
