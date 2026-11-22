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

it.each([{ relationshipRevoked: true }, JSON.stringify({ relationshipRevoked: true })])('excludes removed relationships from portal clients, billing and invitations: %j', async permissions => {
 const deps=fixture();
 deps.db.execute.mockImplementation(async sql => sql.includes('FROM users') ? [[guardian]] : sql.includes('FROM client_guardians') ? [[
  {client_id:10,agency_id:2,full_name:'Incorrect relationship',access_enabled:0,permissions_json:permissions},
  {client_id:12,agency_id:2,full_name:'Current relationship',access_enabled:0,permissions_json:{}}
 ]] : [[]]);
 deps.resolveAccess.mockResolvedValue({ok:true});
 const result=await guardianWorkspace({actor,guardianId:20},deps);
 expect(result.clients.map(c=>c.client_id)).toEqual([12]);
 expect(result.clients[0].access_enabled).toBe(0);
 expect(deps.resolveAccess).toHaveBeenCalledWith({userId:40,role:'admin',clientId:12});
 expect(deps.balances).toHaveBeenCalledExactlyOnceWith({agencyId:2,userId:40,clientId:12,staff:true});
 expect(result.historicalRelationships).toEqual([expect.objectContaining({client_id:10,full_name:'Incorrect relationship',status:'incorrect'})]);
 expect(result.historicalRelationships[0]).not.toHaveProperty('billing');
 expect(deps.db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it('keeps the guardian account readable when its only relationship was removed', async () => {
 const deps=fixture();
 deps.db.execute.mockImplementation(async sql => sql.includes('FROM users') ? [[guardian]] : sql.includes('FROM client_guardians') ? [[
  {client_id:10,agency_id:2,full_name:'Incorrect relationship',access_enabled:0,permissions_json:{relationshipRevoked:true}}
 ]] : [[]]);
 const result=await guardianWorkspace({actor:{id:40,role:'super_admin'},guardianId:20},deps);
 expect(result.guardian.id).toBe(20);
 expect(result.clients).toEqual([]);
 expect(deps.resolveAccess).toHaveBeenCalledExactlyOnceWith({userId:40,role:'super_admin',clientId:10});
 expect(result.historicalRelationships).toHaveLength(1);
 expect(deps.balances).not.toHaveBeenCalled();
 expect(deps.db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});

it('does not expose past relationships outside the staff member’s client access', async () => {
 const deps=fixture(),base=deps.db.execute.getMockImplementation();
 deps.db.execute.mockImplementation(async(sql,params)=>sql.includes('FROM client_guardians') ? [[
  {client_id:10,agency_id:2,full_name:'Visible current client',access_enabled:0,permissions_json:{}},
  {client_id:11,agency_id:3,full_name:'Private former client',access_enabled:0,permissions_json:{relationshipRevoked:true}}
 ]] : base(sql,params));
 const result=await guardianWorkspace({actor,guardianId:20},deps);
 expect(result.clients.map(client=>client.client_id)).toEqual([10]);
 expect(result.historicalRelationships).toEqual([]);
 expect(JSON.stringify(result)).not.toContain('Private former client');
});

it('retains the last recorded sign-in for an authorized past relationship', async () => {
 const deps=fixture(),base=deps.db.execute.getMockImplementation();
 deps.db.execute.mockImplementation(async(sql,params)=>sql.includes('FROM client_guardians') ? [[
  {client_id:10,agency_id:2,full_name:'Former client',access_enabled:0,permissions_json:{relationshipRevoked:true}}
 ]] : sql.includes('FROM user_activity_log') ? [[{lastLogin:'2026-11-21 13:13:00'}]] : base(sql,params));
 const result=await guardianWorkspace({actor,guardianId:20},deps);
 expect(result.clients).toEqual([]);
 expect(result.guardian.lastLogin).toBe('2026-11-21T13:13:00.000Z');
 expect(deps.db.execute.mock.calls.find(([sql])=>sql.includes('FROM user_activity_log'))[1]).toEqual([20,2]);
});
