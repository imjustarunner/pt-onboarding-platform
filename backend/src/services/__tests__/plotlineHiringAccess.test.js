import {expect,it,vi} from 'vitest';
const backoffice=vi.hoisted(()=>vi.fn());
vi.mock('../../middleware/auth.middleware.js',()=>({requireBackofficeAdmin:backoffice}));
import {requirePlotlineHiringOrBackoffice} from '../../middleware/plotlineHiringAccess.middleware.js';
it('uses scoped hiring permission, not the operator’s platform role',()=>{
  for(const role of ['support','staff']){
    const next=vi.fn(),res={status:vi.fn().mockReturnThis(),json:vi.fn()};
    requirePlotlineHiringOrBackoffice({plotlineHiringAgencyId:463,user:{role,agencyAccess:{permissions:{has_hiring_access:false}}}},res,next);
    expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(403);
    requirePlotlineHiringOrBackoffice({plotlineHiringAgencyId:463,user:{role,agencyAccess:{permissions:{has_hiring_access:true}}}},res,next);
    expect(next).toHaveBeenCalledTimes(1);
  }
  expect(backoffice).not.toHaveBeenCalled();
});
it('preserves the ordinary authorization guard outside a scoped Plotline hiring resource',()=>{
  const req={user:{role:'staff'}},res={},next=vi.fn();
  requirePlotlineHiringOrBackoffice(req,res,next);expect(backoffice).toHaveBeenCalledWith(req,res,next);
});
