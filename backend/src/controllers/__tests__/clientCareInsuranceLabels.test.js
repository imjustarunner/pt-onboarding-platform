import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../services/clientInsurance.service.js',()=>({readClientInsurance:vi.fn()}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
vi.mock('../../services/clientAccessLog.service.js',()=>({logClientAccess:vi.fn()}));
vi.mock('../../services/clientCareBillingSummary.service.js',()=>({clientCareBillingSummary:vi.fn()}));
vi.mock('../../services/schedulingBillingAccess.service.js',()=>({hasSchedulingBillingAccess:vi.fn()}));
import Client from '../../models/Client.model.js';
import {readClientInsurance} from '../../services/clientInsurance.service.js';
import {resolveClientRecordAccess} from '../../services/clientRecordAccess.service.js';
import {clientCareBillingSummary} from '../../services/clientCareBillingSummary.service.js';
import {getClientCareInsuranceLabels} from '../clientCareBillingSummary.controller.js';
const req=()=>({user:{id:5,role:'provider'},params:{id:8},query:{agencyId:99,includeAmounts:true,includeVerification:'1'}});
const response=()=>{const r={set:vi.fn(),status:vi.fn(),json:vi.fn()};for(const fn of Object.values(r))fn.mockReturnValue(r);return r;};
beforeEach(()=>{vi.clearAllMocks();Client.findById.mockResolvedValue({id:8,agency_id:2});resolveClientRecordAccess.mockResolvedValue({ok:true});readClientInsurance.mockResolvedValue({primary:{insurerName:'Payer',programType:'commercial',memberId:'PRIVATE_MEMBER',planName:'PRIVATE_PLAN',copay:'100'},secondary:{insurerName:'Medicaid',isMedicaid:true},eligibilityFieldSources:{private:'PRIVATE_SOURCE'},patient:{firstName:'PRIVATE_NAME'},verifiedForClaims:true});});
it('returns only insurer name and coverage category, ignoring financial query parameters',async()=>{
 const r=response(),next=vi.fn();await getClientCareInsuranceLabels(req(),r,next);expect(next).not.toHaveBeenCalled();
 expect(r.json).toHaveBeenCalledWith({policies:[{insurerName:'Payer',programType:'commercial'},{insurerName:'Medicaid',programType:'medicaid'}]});
 expect(JSON.stringify(r.json.mock.calls)).not.toMatch(/PRIVATE|memberId|verification|benefits|balance|patient|position/);expect(readClientInsurance).toHaveBeenCalledWith(8,2);expect(clientCareBillingSummary).not.toHaveBeenCalled();expect(r.set).toHaveBeenCalledWith('Cache-Control','no-store');
});
it('denies a provider outside the client record before reading insurance',async()=>{
 resolveClientRecordAccess.mockResolvedValue({ok:false,status:403,message:'Not assigned'});const r=response();await getClientCareInsuranceLabels(req(),r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(readClientInsurance).not.toHaveBeenCalled();
});
it.each(['client_guardian','school_staff','client'])('does not expose the internal view to %s',async role=>{
 const r=response();await getClientCareInsuranceLabels({...req(),user:{id:5,role}},r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(readClientInsurance).not.toHaveBeenCalled();
});
