import {expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {createMobileClientDirectory,createMobileClientDirectoryContext} from '../clientDirectory.service.js';
const user={id:7,role:'provider',is_active:1};
const agencies=[{id:10,name:'One',portal_url:'itsco'},{id:20,name:'Two',portal_url:'tisi'}];
const rows=[{id:1,scope_agency_id:10,agency_id:10,full_name:'Michael Example',date_of_birth:'2000-02-02',client_type:'clinical'},{id:2,scope_agency_id:20,agency_id:20,full_name:'Other Tenant',date_of_birth:'2014-04-14',client_type:'school'}];
const request=(query={})=>({quickView:{userId:7,agencyId:10,mobileDeviceSessionId:9},query});
function setup(extra={}){const deps={db:{execute:vi.fn(async()=>[rows])},findUser:vi.fn(async()=>user),listAgencies:vi.fn(async()=>({agencies})),getActor:vi.fn(async user=>({...user})),canView:vi.fn(async()=>true),...extra};return {deps,run:createMobileClientDirectory(deps)};}
it('lists masked identities from fresh affiliated agencies without contact, DOB, or full-name fields',async()=>{const {run,deps}=setup();const data=await run(request());expect(data.clients).toHaveLength(2);expect(data.clients[0]).toMatchObject({maskedName:'Mic* Exa*',agencyId:10,agencyName:'One',summaryAvailable:true,fullProfileUrl:expect.stringContaining('/admin/clients/1')});expect(JSON.stringify(data)).not.toContain('Michael Example');expect(JSON.stringify(data)).not.toContain('2000-02-02');expect(data.clients[1].agencyName).toBe('Two');expect(deps.listAgencies).toHaveBeenCalledWith(user);});
it('uses current record access for every row and never returns a denied client',async()=>{const {run,deps}=setup({canView:vi.fn(async(actor,row)=>row.id===1)});expect((await run(request())).clients.map(c=>c.id)).toEqual([1]);expect(deps.canView).toHaveBeenCalledTimes(2);expect(deps.db.execute.mock.calls[0][0]).toContain('client_provider_assignments');});
it('rejects legacy PINs, unknown workspaces and invalid page cursors before querying private clients',async()=>{const {run,deps}=setup();await expect(run({quickView:{userId:7},query:{}})).rejects.toMatchObject({status:403});await expect(run(request({agencyId:'99'}))).rejects.toMatchObject({status:403});await expect(run(request({page:'-1'}))).rejects.toMatchObject({status:400});expect(deps.db.execute).not.toHaveBeenCalled();});
it('does not grant clinical summary rights to a basic account-support role',async()=>{const {run}=setup({getActor:vi.fn(async u=>({...u,role:'support'}))});expect((await run(request())).clients.every(c=>c.summaryAvailable===false)).toBe(true);});
it('uses stored initials for school staff and omits an unsupported full clinical profile destination',async()=>{const {run}=setup({db:{execute:vi.fn(async()=>[[{...rows[1],initials:'OTHCLI'}]])},getActor:vi.fn(async u=>({...u,role:'school_staff'}))});expect((await run(request())).clients[0]).toMatchObject({maskedName:'OTHCLI',summaryAvailable:false,fullProfileUrl:null});});
it('includes current supervision in candidate scope and keeps the normal record access check',async()=>{const {run,deps}=setup();await run(request());expect(deps.db.execute.mock.calls[0][0]).toContain('supervisor_assignments');expect(deps.canView).toHaveBeenCalledTimes(2);});
it('resolves an authorized other-agency summary without changing the device workspace',async()=>{
 const {deps}=setup({db:{execute:vi.fn(async()=>[[rows[1]]])}}),run=createMobileClientDirectoryContext(deps),req=request();
 const context=await run(req,2,20);
 expect(context).toMatchObject({agency:{id:20},client:{id:2},clinical:true});
 expect(req.quickView.agencyId).toBe(10);
 expect(deps.db.execute.mock.calls[0][1]).toEqual([2,20,20,20,20]);
});
it('denies unknown memberships, failed per-client access, and portal-only roles',async()=>{
 const {deps}=setup({db:{execute:vi.fn(async()=>[[rows[0]]])},canView:vi.fn(async()=>false)}),run=createMobileClientDirectoryContext(deps);
 await expect(run(request(),1,30)).rejects.toMatchObject({status:403});
 await expect(run(request(),1,10)).rejects.toMatchObject({status:404});
 const portal=createMobileClientDirectoryContext({...deps,getActor:async()=>({id:7,role:'guardian'})});
 await expect(portal(request(),1,10)).rejects.toMatchObject({status:403});
});
it('rejects suspended users and PIN-only sessions before private summary queries',async()=>{
 const {deps}=setup({findUser:async()=>({...user,status:'INACTIVE_EMPLOYEE'})}),run=createMobileClientDirectoryContext(deps);
 await expect(run(request(),1,10)).rejects.toMatchObject({status:403});
 await expect(run({quickView:{userId:7,agencyId:10}},1,10)).rejects.toMatchObject({status:403});
 expect(deps.db.execute).not.toHaveBeenCalled();
});
