import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../models/Client.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
vi.mock('../clientCareBillingSummary.service.js',()=>({clientCareBillingSummary:vi.fn()}));
vi.mock('../clientAccessLog.service.js',()=>({logClientAccess:vi.fn()}));
import Client from '../../models/Client.model.js';
import {resolveClientRecordAccess} from '../clientRecordAccess.service.js';
import {clientCareBillingSummary} from '../clientCareBillingSummary.service.js';
import {getClientCareBillingSummary} from '../../controllers/clientCareBillingSummary.controller.js';
beforeEach(()=>{vi.clearAllMocks();Client.findById.mockResolvedValue({id:2,agency_id:1});clientCareBillingSummary.mockResolvedValue({policies:[],balance:{status:'no_balance_due'}});});
const response=()=>{const res={status:vi.fn(),json:vi.fn(),set:vi.fn()};for(const key of ['status','json','set'])res[key].mockReturnValue(res);return res;};
it('denies guardian and school users before reading any financial summary',async()=>{for(const role of ['client_guardian','school_staff','client']){const res=response();await getClientCareBillingSummary({user:{id:5,role},params:{id:2}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);}expect(clientCareBillingSummary).not.toHaveBeenCalled();});
it('denies a provider outside client-record access and derives tenant scope from the client record',async()=>{
 const req={user:{id:5,role:'provider'},params:{id:2},query:{agencyId:99}};
 resolveClientRecordAccess.mockResolvedValue({ok:false,status:403,message:'Not assigned'});const denied=response();await getClientCareBillingSummary(req,denied,vi.fn());expect(denied.status).toHaveBeenCalledWith(403);expect(clientCareBillingSummary).not.toHaveBeenCalled();
 resolveClientRecordAccess.mockResolvedValue({ok:true});const allowed=response(),next=vi.fn();await getClientCareBillingSummary(req,allowed,next);expect(clientCareBillingSummary).toHaveBeenCalledWith(1,2);expect(allowed.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(next).not.toHaveBeenCalled();
});
