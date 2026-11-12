import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../providerYearUpdate.service.js',()=>({listSchoolAssignedProviders:async()=>[]}));
vi.mock('../providerUpdateRecipient.service.js',()=>({resolveProviderUpdateRecipients:vi.fn(async(_agency,users)=>users.map(user=>({...user,qa_workflow_allowed:user.provider_user_id===1496})))}));
import pool from '../../config/database.js';
import {listEligibleProviders} from '../providerUpdate.service.js';
import {resolveProviderUpdateRecipients} from '../providerUpdateRecipient.service.js';
it('does not add global demo testers or unapproved demos to a scoped NLU employee update roster',async()=>{
 const people=[{id:1496,provider_user_id:1496,first_name:'Finley',last_name:'QA',role:'provider',is_demo:1},{id:1772,provider_user_id:1772,first_name:'Devon',last_name:'QA',role:'staff',is_demo:1},{id:501,provider_user_id:501,first_name:'Ordinary',last_name:'Staff',role:'staff',is_demo:0}];
 pool.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM demo_test_accounts'))return [[{id:1900,provider_user_id:1900,first_name:'Foreign',last_name:'Demo',role:'provider',is_demo:1,account_group:'demo'}]];
  if(sql.includes('FROM users u'))return [people];
  throw new Error('Unexpected roster query');
 });
 const rows=await listEligibleProviders(453);
 expect(rows.map(row=>row.provider_user_id).sort((a,b)=>a-b)).toEqual([501,1496]);
 expect(rows.find(row=>row.provider_user_id===1496).is_demo).toBe(1);
 expect(resolveProviderUpdateRecipients).toHaveBeenCalledWith(453,expect.any(Array));
});
