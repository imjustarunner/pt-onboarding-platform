import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {publishLearningPackages} from '../learningCatalogPublication.service.js';
it('publishes the configured offers once to the family catalog and preserves unrelated packages',async()=>{
 const records=[{id:20,name:'Other',domainConfig:{}}];let id=30;
 const packages={listForAgency:vi.fn(async()=>records),create:vi.fn(async(a,b)=>{const p={id:++id,...b};records.push(p);return p;}),update:vi.fn(async(id,a,b)=>Object.assign(records.find(p=>p.id===id),b))};
 const services={listForAgency:async()=>[{id:318,isActive:true,serviceCode:'TUTORING',businessType:'tutoring',packageEligible:true,modality:'TELEHEALTH'},{id:319,isActive:true,serviceCode:'TUTORING',businessType:'tutoring',packageEligible:true,modality:'IN_PERSON'},{id:9,isActive:true,businessType:'mental_health',packageEligible:true,modality:'EITHER'}]};
 const offer={id:'qa-virtual',name:'Four visits',program:'tutoring',published:true,components:[{service:'tutoring',format:'virtual',sessions:4,minutes:60,pricingMode:'provider-discount',discountPercent:10}]};
 const input={agencyId:453,catalog:{packages:[offer]},actorUserId:1435};
 const first=await publishLearningPackages(input,{packages,services});await publishLearningPackages(input,{packages,services});
 expect(packages.create).toHaveBeenCalledOnce();expect(first[0]).toMatchObject({packageId:31,status:'published'});
 expect(records[1]).toMatchObject({allowedTenantServiceIds:[318],isPublic:true,sessionCount:4,consumeOn:'complete',domainConfig:{pricing:{mode:'provider-discount',discountPercent:10}}});
 await publishLearningPackages({...input,catalog:{packages:[]}},{packages,services});expect(records[1].isPublic).toBe(false);expect(records[0]).toEqual({id:20,name:'Other',domainConfig:{}});
});
it('requires explicit package setup for composite offers instead of granting incomplete credits',async()=>{
 const packages={listForAgency:async()=>[],create:vi.fn()},services={listForAgency:async()=>[]};
 const result=await publishLearningPackages({agencyId:453,catalog:{packages:[{id:'bridge',components:[{service:'tutoring'},{service:'counseling'}]}]}},{packages,services});expect(result[0].status).toBe('requires_package_configuration');expect(packages.create).not.toHaveBeenCalled();
});

it('does not publish an unrestricted tutoring offer when its canonical service is missing',async()=>{
 const packages={listForAgency:async()=>[],create:vi.fn()},services={listForAgency:async()=>[{id:321,isActive:true,businessType:'tutoring',serviceCode:'HOMEWORK HELP',packageEligible:true,modality:'IN_PERSON'}]};
 const result=await publishLearningPackages({agencyId:453,catalog:{packages:[{id:'four',published:true,components:[{service:'tutoring',format:'in-person',pricingMode:'provider-discount'}]}]}},{packages,services});expect(result[0].status).toBe('requires_service_configuration');expect(packages.create).not.toHaveBeenCalled();
});
