import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),request:vi.fn(),agency:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{getActiveAgencyIdForOrganization:m.agency}}));
vi.mock('../../controllers/providerUpdateReview.controller.js',()=>({schoolAdjustment:m.request}));
import {applyProviderSchoolAvailability} from '../schoolPortal.controller.js';
let req,res,next;
beforeEach(()=>{
 vi.clearAllMocks();
 req={params:{organizationId:'451'},user:{id:1433,role:'provider'},body:{providerId:999,agencyId:999,assignmentId:999,dayOfWeek:'Monday',fromSlotsTotal:4,fromStartTime:'09:00',fromEndTime:'13:00',slotsTotal:5,startTime:'08:00',endTime:'14:00',note:'More hours available'}};
 res={status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();
 m.execute.mockResolvedValue([[{id:731,slots_total:4,start_time:'09:00:00',end_time:'13:00:00'}]]);
 m.agency.mockResolvedValue(450);m.request.mockImplementation(async(_req,response)=>response.status(201).json({ok:true,request:{id:99}}));
});
it('converts the legacy portal apply action into a pending request without changing approved assignments',async()=>{
 await applyProviderSchoolAvailability(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('AND is_active=1'),[451,1433,'Monday']);
 expect(m.execute.mock.calls.every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
 expect(m.request).toHaveBeenCalledWith(expect.objectContaining({user:expect.objectContaining({id:1433}),params:{assignmentId:'731'},body:{agencyId:450,slotsTotal:5,startTime:'08:00',endTime:'14:00',moveToDay:'Monday',notes:'More hours available'}}),res,next);
 expect(res.status).toHaveBeenCalledWith(201);
});
it('requires the providers own active school day instead of a caller-supplied assignment',async()=>{
 m.execute.mockResolvedValue([[]]);await applyProviderSchoolAvailability(req,res,next);
 expect(res.status).toHaveBeenCalledWith(403);expect(m.request).not.toHaveBeenCalled();
});
it('rejects a stale form rather than requesting against changed approved hours',async()=>{
 req.body.fromStartTime='08:00';await applyProviderSchoolAvailability(req,res,next);
 expect(res.status).toHaveBeenCalledWith(409);expect(m.request).not.toHaveBeenCalled();
});
it('does not grant the provider request path to school staff',async()=>{
 req.user.role='school_staff';await applyProviderSchoolAvailability(req,res,next);
 expect(res.status).toHaveBeenCalledWith(403);expect(m.execute).not.toHaveBeenCalled();expect(m.request).not.toHaveBeenCalled();
});
