import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
vi.mock('../familyLedger/policy.js',()=>({requireBillingStaff:vi.fn()}));
vi.mock('../familyLedger/views.js',()=>({listBalances:vi.fn()}));
import {guardianWorkspace} from '../guardianWorkspace.service.js';
const actor={id:40,role:'admin'},guardian={id:20,first_name:'Parent',email:'parent@example.test',phone:'3035550100',password_set:0};
function fixture(){
 const db={execute:vi.fn(async sql=>sql.includes('FROM users')?[[guardian]]:sql.includes('FROM client_guardians')?[[{client_id:10,agency_id:2,full_name:'First Child',access_enabled:1},{client_id:11,agency_id:3,full_name:'Other agency child',access_enabled:1}]]:[[]])};
 return {db,resolveAccess:vi.fn(async({clientId})=>({ok:clientId===10})),authorizeBilling:vi.fn(),balances:vi.fn(async()=>[
  {payerUserId:20,dueCents:4500,billingState:'due'},{payerUserId:21,dueCents:9000,billingState:'due'},
  {payerUserId:20,dueCents:0,balanceCents:10000,billingState:'review'},{payerUserId:20,dueCents:2000,paymentStatus:'pending',billingState:'due'}])};
}
it('retains the staff actor, hides inaccessible siblings and separates this guardian’s verified balance from other payers and holds',async()=>{
 const deps=fixture(),result=await guardianWorkspace({actor,guardianId:20},deps);
 expect(result.actorUserId).toBe(40);expect(result.clients).toHaveLength(1);
 expect(result.clients[0].billing).toMatchObject({available:true,amountDueCents:4500,reviewCount:2});
 expect(deps.balances).toHaveBeenCalledExactlyOnceWith({agencyId:2,userId:40,clientId:10,staff:true});
 expect(JSON.stringify(result)).not.toContain('Other agency child');expect(deps.db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it('does not fetch billing without billing staff access and does not display an unavailable balance as zero',async()=>{
 const deps=fixture();deps.authorizeBilling.mockRejectedValue(Object.assign(new Error('denied'),{status:403}));
 const result=await guardianWorkspace({actor,guardianId:20},deps);
 expect(result.clients[0].billing).toEqual({available:false});expect(deps.balances).not.toHaveBeenCalled();
});
it('rejects family identities and unrelated staff accounts',async()=>{
 const deps=fixture();await expect(guardianWorkspace({actor:{id:20,role:'client_guardian'},guardianId:20},deps)).rejects.toHaveProperty('status',403);
 expect(deps.db.execute).not.toHaveBeenCalled();deps.resolveAccess.mockResolvedValue({ok:false});
 await expect(guardianWorkspace({actor,guardianId:20},deps)).rejects.toHaveProperty('status',403);
 expect(deps.balances).not.toHaveBeenCalled();
});

it('shows a recorded sign-in only from the account’s authorized linked practices', async () => {
 const deps = fixture();
 const base = deps.db.execute.getMockImplementation();
 deps.db.execute.mockImplementation(async (sql, params) => sql.includes('FROM user_activity_log')
   ? [[{lastLogin:'2026-11-21 13:13:00'}]]
   : base(sql, params));
 const result = await guardianWorkspace({actor, guardianId:20}, deps);
 expect(result.guardian).toMatchObject({password_set:0,lastLogin:'2026-11-21T13:13:00.000Z'});
 expect(deps.db.execute.mock.calls.find(([sql])=>sql.includes('FROM user_activity_log'))?.[1]).toEqual([20,2]);
});
