import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../enrollmentAgencyAccess.service.js',()=>({assertEnrollmentAgencyMembership:vi.fn()}));
import {createPortalViewAs} from '../portalViewAs.service.js';
import {previewRouteAllowed} from '../auricwellPreviewPolicy.js';
const context={actor:{id:1,role:'admin'},agencyId:2,clientId:7,userId:10};
let db,membership,service;
beforeEach(()=>{db={execute:vi.fn(async sql=>sql.includes('FROM clients WHERE')?[[{id:7,agency_id:2}]]:sql.includes('FROM client_guardians')?[[{id:10,first_name:'Parent',last_name:'One',role:'client_guardian',access_enabled:1,is_active:1},{id:11,role:'client_guardian',access_enabled:0,is_active:1}]]:sql.includes('MAX(')?[[{lastLogin:null,lastActivity:null}]]:[[]])};membership=vi.fn();service=createPortalViewAs({db,assertMembership:membership});});
it('permits only admin, support and superadmin and independently checks practice membership',async()=>{
 for(const role of ['admin','support','super_admin'])expect((await service.target({...context,actor:{id:1,role}})).user.id).toBe(10);
 for(const role of ['provider','staff','supervisor','client','client_guardian'])await expect(service.accounts({...context,actor:{id:1,role}})).rejects.toMatchObject({status:403});
 expect(membership).toHaveBeenCalledTimes(3);membership.mockRejectedValueOnce(Object.assign(Error('No membership'),{status:403}));await expect(service.target(context)).rejects.toMatchObject({status:403});
});
it('rejects another practice, unrelated parents, revoked links, and inactive accounts',async()=>{
 await expect(service.target({...context,userId:99})).rejects.toMatchObject({status:403});await expect(service.target({...context,userId:11})).rejects.toMatchObject({status:403});
 db.execute.mockResolvedValueOnce([[]]);await expect(service.target(context)).rejects.toMatchObject({status:404});
 db.execute.mockImplementation(async sql=>sql.includes('FROM clients WHERE')?[[{id:7}]]:[[{id:10,role:'client',access_enabled:1,is_active:0}]]);await expect(service.target(context)).rejects.toMatchObject({status:403});
});
it('shows this account’s portal opens and network address, without session tokens or message contents',async()=>{await service.activity(context);const call=db.execute.mock.calls.find(([sql])=>sql.includes('ip_address AS ipAddress'));expect(call[0]).toContain('user_id=? AND agency_id=?');expect(call[1]).toEqual([10,2]);expect(call[0]).not.toMatch(/metadata|session_id/);const evidence=db.execute.mock.calls.find(([sql])=>sql.includes('security_evidence'));expect(evidence[0]).toContain('client_ip');expect(evidence[1]).toEqual([10]);expect(evidence[0]).not.toMatch(/actor_email|session_ref|details|user_agent|forwarded_ips/);});
it('limits the AuricWell boundary to read-only portal endpoints',()=>{for(const path of ['/portal-admin/clients/7/accounts','/portal-admin/clients/7/accounts/10/read','/portal-admin/clients/7/accounts/10/activity']){expect(previewRouteAllowed('GET',path)).toBe(true);for(const method of ['POST','PATCH','PUT','DELETE'])expect(previewRouteAllowed(method,path)).toBe(false);}expect(previewRouteAllowed('GET','/portal-admin/clients/7/accounts/10/pay')).toBe(false);});

it('keeps access available while showing the separate invitation response and durable delivery',async()=>{
 db.execute.mockImplementation(async sql=>sql.includes('FROM clients WHERE')?[[{id:7,agency_id:2}]]:[[{id:10,role:'client_guardian',access_enabled:1,is_active:1,invitationId:28,enrollmentStatus:'pending',invitationExpiresAt:'2099-01-01',invitationDeliveryStatus:'sent'}]]);
 const {accounts}=await service.accounts(context);
 expect(accounts[0]).toMatchObject({available:true,invitationId:28,enrollmentStatus:'pending',invitationDeliveryStatus:'sent'});
 const query=db.execute.mock.calls.find(([sql])=>sql.includes('FROM client_guardians'));
 expect(query[0]).toContain('ic.client_id=cg.client_id AND ci.agency_id=?');expect(query[1]).toEqual([2,2,2,2,7]);
});
