import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({context:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../paySystem.service.js',async importOriginal=>({...await importOriginal(),loadUserPaySystemContext:mocks.context}));
import {tutoringClaimAmount} from '../tutoringPayroll.service.js';
import PayrollPaySystemRate from '../../models/PayrollPaySystemRate.model.js';
const profile={tutoringRate:20.5,indirectRate:18,supplementalRatesEffectiveOn:'2026-10-14'};
const claim={agency_id:2,user_id:4,claim_date:new Date('2026-10-15T00:00:00Z'),payload:{units:4,part:'direct'}};
beforeEach(()=>{vi.clearAllMocks();mocks.context.mockResolvedValue({enabled:true,rateProfile:profile,status:{}});});
it('prices direct and indirect claims separately on their service date',async()=>{
 expect(await tutoringClaimAmount(claim)).toBe(20.5);
 expect(await tutoringClaimAmount({...claim,payload:{units:4,part:'indirect'}})).toBe(3);
 expect(mocks.context).toHaveBeenCalledWith({agencyId:2,userId:4,periodEnd:'2026-10-15'});
});
it('uses the same tutoring rate for reviewed hours',async()=>{
 expect(await tutoringClaimAmount(claim,0.5)).toBe(10.25);
 expect(await tutoringClaimAmount({...claim,payload:{units:4,part:'indirect'}},1/6)).toBe(3);
});
it('blocks approval before activation and without a rate',async()=>{
 await expect(tutoringClaimAmount({...claim,claim_date:'2026-10-13'})).rejects.toThrow('not effective');
 mocks.context.mockResolvedValue({enabled:false});await expect(tutoringClaimAmount(claim)).rejects.toThrow('active tutoring rate');
});
it('preserves omitted supplemental columns when another settings client saves a profile',async()=>{
 mocks.execute.mockResolvedValue([[]]);
 await PayrollPaySystemRate.upsert(2,1,2,{creditRate:42});
 const [sql,args]=mocks.execute.mock.calls[0];expect(sql.match(/\?/g)).toHaveLength(args.length);
 expect(args.slice(-4)).toEqual([0,0,0,0]);
 mocks.execute.mockClear();await PayrollPaySystemRate.upsert(2,1,2,{tutoringRate:20.5,h2014Rate:22});
 const [_,saved]=mocks.execute.mock.calls[0];expect(saved.slice(7,9)).toEqual([20.5,22]);expect(saved.slice(-4)).toEqual([1,1,0,0]);
});
