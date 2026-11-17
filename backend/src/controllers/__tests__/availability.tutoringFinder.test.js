import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),availability:vi.fn(),offered:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../services/providerAvailability.service.js',()=>({default:{computeWeekAvailability:m.availability}}));
vi.mock('../../services/providerServiceOfferings.service.js',()=>({readProviderServices:m.offered}));
import {listIntakeAvailabilityCards} from '../availability.controller.js';
const req={query:{agencyId:'453',serviceType:'tutoring',weekStart:'2026-11-16'},user:{id:1807,role:'admin'}};
const response=()=>({status:vi.fn(function(){return this}),json:vi.fn()});
beforeEach(()=>{
 vi.resetAllMocks();m.execute.mockImplementation(async sql=>sql.includes('SELECT 1 FROM user_agencies')?[[{ok:1}]]:sql.includes('SELECT DISTINCT u.id')?[[{id:1496,first_name:'Finley'},{id:1434,first_name:'Jordan'}]]:[[]]);
 m.offered.mockImplementation(async id=>({careEligibility:{canProvideCare:id===1496},services:id===1496?[{serviceType:'tutoring',offered:true}]:[]}));
 m.availability.mockResolvedValue({inPersonSlots:[],virtualSlots:[{startAt:'2026-11-17T22:15:00Z',endAt:'2026-11-17T23:15:00Z'}]});
});
it('finds tutoring openings for current students without treating support as a tutor',async()=>{
 const res=response(),next=vi.fn();await listIntakeAvailabilityCards(req,res,next);expect(next).not.toHaveBeenCalled();
 expect(m.availability).toHaveBeenCalledTimes(1);expect(m.availability).toHaveBeenCalledWith(expect.objectContaining({providerId:1496,agencyId:453,intakeOnly:false,serviceType:'tutoring'}));
 expect(res.json.mock.calls[0][0].providers.map(row=>row.providerId)).toEqual([1496]);
});
it('keeps counseling enrollment openings distinct',async()=>{
 const res=response();await listIntakeAvailabilityCards({...req,query:{...req.query,serviceType:'counseling'}},res,vi.fn());
 expect(m.availability).toHaveBeenCalledWith(expect.objectContaining({intakeOnly:true,serviceType:'counseling'}));
});
it('denies another agency before reading availability',async()=>{
 m.execute.mockResolvedValue([[]]);const res=response();await listIntakeAvailabilityCards(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(m.availability).not.toHaveBeenCalled();
});
