import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import pool from '../../config/database.js';
import {providerAvailabilityDashboard} from '../availability.controller.js';

const school={id:731,provider_user_id:1433,provider_first_name:'Avery',provider_last_name:'QA',school_organization_id:451,school_name:'Cedar Grove',school_organization_type:'school',day_of_week:'Monday',start_time:'09:00:00',end_time:'13:00:00',slots_total:4,slots_available:1,is_active:1,accepting_new_clients_override:null};
const req=()=>({query:{agencyId:'450',providerId:'1433'},user:{id:1434,role:'support'}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockImplementation(async sql=>{
 if(sql.includes('SELECT 1 FROM user_agencies'))return [[{1:1}]];
 if(sql.includes('FROM provider_school_assignments psa'))return [[school]];
 return [[]];
});});
it('returns an active affiliated school assignment without requiring a redundant provider school membership',async()=>{
 const res=response(),next=vi.fn();await providerAvailabilityDashboard(req(),res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({schoolSlots:[expect.objectContaining({id:731,providerId:1433,schoolOrganizationId:451,startTime:'09:00',endTime:'13:00',slotsTotal:4})]}));
 const [sql,params]=pool.execute.mock.calls.find(([query])=>query.includes('FROM provider_school_assignments psa'));
 expect(sql).toContain('ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1');expect(sql).toContain('oa.is_active = TRUE');expect(sql).toContain('oa.agency_id = ?');expect(sql).toContain('psa.provider_user_id = ?');expect(sql).toContain('psa.is_active = TRUE');expect(sql).not.toContain('ua_school');expect(params).toEqual([450,450,1433]);
});
it('rejects a support user outside the agency before reading any assignments',async()=>{
 pool.execute.mockResolvedValue([[]]);const res=response();await providerAvailabilityDashboard(req(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(pool.execute).toHaveBeenCalledTimes(1);expect(res.json).toHaveBeenCalledWith({error:{message:'Access denied'}});
});
it('does not open the support dashboard to an ordinary provider',async()=>{
 const request=req();request.user={id:1433,role:'provider'};const res=response();await providerAvailabilityDashboard(request,res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(pool.execute).toHaveBeenCalledTimes(1);
});
