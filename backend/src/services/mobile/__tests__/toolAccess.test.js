import {expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {createMobileToolAccess} from '../toolAccess.service.js';
const req={quickView:{mobileDeviceSessionId:1,userId:7,agencyId:10}};
function fixture(overrides={}){const dependencies={access:async()=>({surface:'staff',user:{id:7,role:'admin'}}),listAgencies:async()=>({agencies:[{id:10,name:'One'},{id:20,name:'Two'}]}),readAccess:async(_user,id)=>({agencyId:id,role:id===10?'support':'provider',permissions:{has_hiring_access:id===10}}),...overrides};return createMobileToolAccess(dependencies);}
it('denies legacy passcode and family devices before enumerating staff workspaces',async()=>{
 const listAgencies=vi.fn();await expect(fixture({listAgencies})({quickView:{}},'support')).rejects.toMatchObject({status:403});
 await expect(fixture({listAgencies,access:async()=>({surface:'family'})})(req,'support')).rejects.toMatchObject({status:403});expect(listAgencies).not.toHaveBeenCalled();
});
it('uses the current agency role rather than global administrative privileges',async()=>{
 const run=fixture();expect((await run(req,'support')).map(x=>x.agency.id)).toEqual([10]);expect((await run(req,'exchange')).map(x=>x.agency.id)).toEqual([10,20]);
 await expect(run(req,'support',20)).rejects.toMatchObject({status:403});await expect(run(req,'exchange','20junk')).rejects.toMatchObject({status:400});
});
it('requires the hiring grant and never expands an issued QA agency restriction',async()=>{
 const run=fixture();expect((await run(req,'applicants')).map(x=>x.agency.id)).toEqual([10]);
 const scoped={quickView:{...req.quickView,qaAgencyIds:[10]}};expect((await run(scoped,'exchange')).map(x=>x.agency.id)).toEqual([10]);
 await expect(run(scoped,'exchange',20)).rejects.toMatchObject({status:403});
});
it('treats revoked memberships as unavailable even if they still appear in a directory',async()=>{
 const run=fixture({readAccess:async()=>null});expect(await run(req,'support')).toEqual([]);await expect(run(req,'exchange',10)).rejects.toMatchObject({status:403});
});
