import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn()}));
vi.mock('../schedulingBillingAccess.service.js',()=>({hasSchedulingBillingAccess:vi.fn()}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
vi.mock('../clientCareBillingSummary.service.js',()=>({clientCareBillingSummary:vi.fn()}));
vi.mock('../clientAccessLog.service.js',()=>({logClientAccess:vi.fn()}));
import Client from '../../models/Client.model.js';
import {resolveClientRecordAccess} from '../clientRecordAccess.service.js';
import {clientCareBillingSummary} from '../clientCareBillingSummary.service.js';
import pool from '../../config/database.js';
import {readClientInsurance} from '../clientInsurance.service.js';
import {hasSchedulingBillingAccess} from '../schedulingBillingAccess.service.js';
import {getClientCareBillingSummary, getClientAfterHoursSelfPay, saveClientAfterHoursSelfPay} from '../../controllers/clientCareBillingSummary.controller.js';
beforeEach(()=>{vi.clearAllMocks();Client.findById.mockResolvedValue({id:2,agency_id:1});clientCareBillingSummary.mockResolvedValue({policies:[],balance:{status:'no_balance_due'}});});
const response=()=>{const res={status:vi.fn(),json:vi.fn(),set:vi.fn()};for(const key of ['status','json','set'])res[key].mockReturnValue(res);return res;};
it('denies guardian and school users before reading any financial summary',async()=>{for(const role of ['client_guardian','school_staff','client']){const res=response();await getClientCareBillingSummary({user:{id:5,role},params:{id:2}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);}expect(clientCareBillingSummary).not.toHaveBeenCalled();});
it('denies a provider outside client-record access and derives tenant scope from the client record',async()=>{
 const req={user:{id:5,role:'provider'},params:{id:2},query:{agencyId:99}};
 resolveClientRecordAccess.mockResolvedValue({ok:false,status:403,message:'Not assigned'});const denied=response();await getClientCareBillingSummary(req,denied,vi.fn());expect(denied.status).toHaveBeenCalledWith(403);expect(clientCareBillingSummary).not.toHaveBeenCalled();
 resolveClientRecordAccess.mockResolvedValue({ok:true});
 for (const includeVerification of [false, true]) {
   const allowed = response();
   const next = vi.fn();
   const query = includeVerification ? { ...req.query, includeVerification: '1' } : req.query;
   await getClientCareBillingSummary({ ...req, query }, allowed, next);
   expect(clientCareBillingSummary).toHaveBeenLastCalledWith(1, 2, undefined, { includeVerification });
   expect(allowed.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
   expect(next).not.toHaveBeenCalled();
 }
});

const preferenceRequest = {
 user: { id: 5, role: 'provider' }, params: { id: 2 }, query: { agencyId: 1 },
 body: { mode: 'after_insurance_denial', attested: true }
};
it('requires the current tenant, chart assignment or billing permission, and a workforce role', async () => {
 resolveClientRecordAccess.mockResolvedValue({ ok: true, isAssignedClinician: false });
 hasSchedulingBillingAccess.mockResolvedValue(false);
 for (const req of [
   { ...preferenceRequest, query: { agencyId: 99 } },
   { ...preferenceRequest, user: { id: 5, role: 'client_guardian' } },
   preferenceRequest
 ]) {
   const next = vi.fn();
   await getClientAfterHoursSelfPay(req, response(), next);
   expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
 }
 expect(pool.execute).not.toHaveBeenCalled();
});
it('blocks Medicaid including secondary coverage and requires a provider attestation before recording an opt-in', async () => {
 resolveClientRecordAccess.mockResolvedValue({ ok: true, isAssignedClinician: true });
 readClientInsurance.mockResolvedValue({ primary: { insurerName: 'Commercial' }, secondary: { programType: 'medicaid' } });
 const next = vi.fn();
 await saveClientAfterHoursSelfPay(preferenceRequest, response(), next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
 readClientInsurance.mockResolvedValue({ primary: { insurerName: 'Commercial' } });
 await saveClientAfterHoursSelfPay({ ...preferenceRequest, body: { ...preferenceRequest.body, attested: false } }, response(), next);
 expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ status: 400 }));
 expect(pool.execute).not.toHaveBeenCalled();
 const res = response();
 await saveClientAfterHoursSelfPay(preferenceRequest, res, next);
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO client_after_hours_self_pay_requests'),
   [1, 2, 'after_insurance_denial', 1500, true, 5]);
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1500, mode: 'after_insurance_denial' }));
});
