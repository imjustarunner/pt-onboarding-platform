import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../services/insuranceDemographicsAutomation.service.js',()=>({syncInsuranceDemographicsForEligibility:vi.fn()}));
import Client from '../Client.model.js';
it('stores pending import progress in the same insert as the new chart',async()=>{
 const progress=JSON.stringify({recordsImport:{status:'pending',revision:0,sections:[]}});
 const executor={execute:vi.fn().mockResolvedValue([{insertId:91}])};
 const client=await Client.create({agency_id:2,organization_id:2,initials:'SYN',source:'ADMIN_CREATED',status:'ACTIVE',onboarding_docs_json:progress},{executor,hydrate:false});
 expect(client).toEqual({id:91});const [sql,values]=executor.execute.mock.calls[0];const columns=sql.match(/INSERT INTO clients \(([^)]+)\)/)[1].split(', ');
 expect(values[columns.indexOf('onboarding_docs_json')]).toBe(progress);expect(sql).toContain('onboarding_docs_json');expect(executor.execute).toHaveBeenCalledOnce();
});
