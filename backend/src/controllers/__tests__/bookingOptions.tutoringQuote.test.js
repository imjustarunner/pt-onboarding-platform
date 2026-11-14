import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({quote:vi.fn(),options:vi.fn(),membership:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencyMembership:m.membership}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({organization_type:'agency'})}}));
vi.mock('../../services/businessTypeCapabilities.service.js',()=>({getCapabilitiesForAgency:async()=>({}),buildCapabilitiesPayload:vi.fn()}));
vi.mock('../../services/tenantServiceSuiteDefaults.service.js',()=>({ensureTenantServiceSuitesForAgency:async()=>{}}));
vi.mock('../../services/appointment.service.js',()=>({resolveBookingOptions:m.options}));
vi.mock('../../services/selfPayRates.service.js',()=>({resolveSelfPayQuote:m.quote}));
vi.mock('../../services/schedulingBillingAccess.service.js',()=>({schedulingResponseForUser:async(_u,_a,data)=>data}));
import {getBookingOptions} from '../tenantServices.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.membership.mockResolvedValue({role:'provider'});m.options.mockResolvedValue({services:[{id:320,businessType:'tutoring',serviceCode:'TUTORING',defaultDurationMinutes:60},{id:319,businessType:'mental_health'}]});m.quote.mockImplementation(async({modality})=>({amountCents:modality==='IN_PERSON'?5500:5000,rateCents:modality==='IN_PERSON'?5500:5000,rateUnit:'hour',source:'catalog'}));});
async function run(query){const res={status:vi.fn(function(){return this}),json:vi.fn()},next=vi.fn();await getBookingOptions({params:{agencyId:'453'},query,user:{id:1496,role:'provider'}},res,next);return {res,next};}
it('returns actual separate format quotes, including rate units, only for authorized tutoring options',async()=>{
 const {res,next}=await run({quote:'1',providerId:'1496'});expect(next).not.toHaveBeenCalled();const data=res.json.mock.calls[0][0];expect(data.services[0].quotes).toMatchObject({TELEHEALTH:{amountCents:5000,rateUnit:'hour'},IN_PERSON:{amountCents:5500,rateUnit:'hour'}});expect(data.services[1].quotes).toBeUndefined();expect(m.quote.mock.calls.map(([x])=>x.learningFormat)).toEqual(['virtual','in-person']);
});
it('retains existing lightweight options when no quote is requested and denies a foreign agency first',async()=>{
 await run({providerId:'1496'});expect(m.quote).not.toHaveBeenCalled();m.membership.mockResolvedValue(null);const {res}=await run({quote:'1',providerId:'1496'});expect(res.status).toHaveBeenCalledWith(403);expect(m.options).toHaveBeenCalledTimes(1);
});
it('leaves missing configured rates unavailable without substituting a flat price',async()=>{
 m.quote.mockRejectedValue(Object.assign(new Error('Missing format price'),{status:409}));const {res,next}=await run({quote:'1',providerId:'1496'});expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].services[0].quotes).toEqual({TELEHEALTH:null,IN_PERSON:null});
});
