import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/schedulingBillingAccess.service.js',()=>({hasSchedulingBillingAccess:vi.fn(async()=>true)}));
vi.mock('../../services/providerBillingNpi.service.js',()=>({providerBillingNpi:vi.fn(async()=> '1234567893')}));
import pool from '../../config/database.js';
import {providerBillingNpi} from '../../services/providerBillingNpi.service.js';
import {hasSchedulingBillingAccess} from '../../services/schedulingBillingAccess.service.js';
import {supervisedProviderReadiness} from '../supervisedBilling.controller.js';
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[{id:1433,first_name:'Avery',last_name:'QA'}]]);hasSchedulingBillingAccess.mockResolvedValue(true);});
const req=()=>({user:{id:1434,role:'support'},query:{agencyId:450}});
const res=()=>({json:vi.fn()});
it('loads provider NPIs from agency credentialing without querying the nonexistent users.npi column',async()=>{
 const response=res(),next=vi.fn();await supervisedProviderReadiness(req(),response,next);
 expect(next).not.toHaveBeenCalled();expect(pool.execute.mock.calls[0][0]).not.toContain('u.npi');
 expect(pool.execute.mock.calls[0][0]).toContain('ua.is_active=1');
 expect(providerBillingNpi).toHaveBeenCalledWith({agencyId:450,userId:1433});
 expect(response.json).toHaveBeenCalledWith({providers:[{id:1433,name:'Avery QA',npi:'1234567893',npiValid:true}]});
});
it('still requires authorized billing access',async()=>{
 hasSchedulingBillingAccess.mockResolvedValue(false);const next=vi.fn();await supervisedProviderReadiness(req(),res(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(pool.execute).not.toHaveBeenCalled();
});
