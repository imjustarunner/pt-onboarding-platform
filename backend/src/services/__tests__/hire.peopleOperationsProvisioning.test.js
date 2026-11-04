import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {configurePeopleOperationsSubmissionSender,PEOPLE_OPS_SENDER_PLAN as plan} from '../../scripts/configurePeopleOperationsSubmissionSender.js';
let d,identity,agency,db;
beforeEach(()=>{
 identity=null;agency={id:2,name:'ITSCO',is_active:1,is_archived:0,feature_flags:{preserved:true}};
 db={execute:vi.fn(async()=>[[{acquired:1}]]),release:vi.fn()};
 d={database:{execute:vi.fn(async sql=>sql.startsWith('SELECT id,name')?[[agency]]:sql.startsWith('SELECT feature_flags')?[[{feature_flags:agency.feature_flags}]]:[[]]),getConnection:vi.fn(async()=>db)},
  directory:{getGroup:vi.fn(async()=>null),getUser:vi.fn(async()=>null),listGroupMembers:vi.fn(async()=>[]),applyGroupAccessSettings:vi.fn(),setGroupMemberDeliverySettings:vi.fn()},
  identities:{findByAgencyAndIdentityKey:vi.fn(async()=>identity),create:vi.fn(async input=>(identity={id:77,agency_id:2,from_email:input.fromEmail,...input})),update:vi.fn(async()=>identity)},
  ensureGroup:vi.fn(async()=>({group:{id:'group-1'}})),verify:vi.fn(),selected:vi.fn(()=>true),configuration:vi.fn()};
});
it('dry-runs the exact dedicated Group plan without any mutation or activation',async()=>{
 expect(await configurePeopleOperationsSubmissionSender({},d)).toMatchObject({dryRun:true,applied:false,plan:{email:plan.email},existingSenderPinsChanged:false,noticesActivationChanged:false,testMailSent:false});
 expect(d.ensureGroup).not.toHaveBeenCalled();expect(d.identities.create).not.toHaveBeenCalled();expect(d.database.getConnection).not.toHaveBeenCalled();
});
it('applies and resumes idempotently through existing Group/identity helpers without changing reviewer flags',async()=>{
 expect(await configurePeopleOperationsSubmissionSender({apply:true},d)).toMatchObject({applied:true,identityId:77,groupVerified:true});
 await configurePeopleOperationsSubmissionSender({apply:true},d);expect(d.identities.create).toHaveBeenCalledOnce();expect(d.identities.update).toHaveBeenCalledOnce();
 expect(d.ensureGroup).toHaveBeenCalledWith({email:plan.email,displayName:plan.groupName,directory:d.directory});
 expect(d.identities.create).toHaveBeenCalledWith(expect.objectContaining({identityKey:'people_operations_notifications',replyTo:'PO@itsco.health',inboundAddresses:[plan.email]}));
 expect(d.directory.setGroupMemberDeliverySettings).toHaveBeenCalledWith(expect.objectContaining({memberEmail:'michael@plottwistco.com',deliverySettings:'NONE'}));
 expect(d.directory.setGroupMemberDeliverySettings).toHaveBeenCalledWith(expect.objectContaining({memberEmail:'ai@plottwistco.com',deliverySettings:'ALL_MAIL'}));
 expect(d.database.execute.mock.calls.some(([sql])=>/INSERT|UPDATE|DELETE/.test(sql))).toBe(false);expect(agency.feature_flags).toEqual({preserved:true});
});
it.each(['user address','other tenant identity','unexpected Group members','not selected by relay','existing purpose address'])('fails closed before provisioning when blocked by %s',async reason=>{
 if(reason==='user address')d.directory.getUser.mockResolvedValue({id:'user-1'});
 if(reason==='other tenant identity')d.database.execute.mockImplementation(async sql=>sql.startsWith('SELECT id,name')?[[agency]]:[[{id:4,agency_id:9,identity_key:'other'}]]);
 if(reason==='unexpected Group members'){d.directory.getGroup.mockResolvedValue({id:'group-1',name:plan.groupName});d.directory.listGroupMembers.mockResolvedValue([{email:'unreviewed@tenant.test'}]);}
 if(reason==='not selected by relay')d.selected.mockReturnValue(false);
 if(reason==='existing purpose address')identity={id:77,from_email:'different@tenant.test'};
 await expect(configurePeopleOperationsSubmissionSender({apply:true},d)).rejects.toThrow();expect(d.ensureGroup).not.toHaveBeenCalled();expect(d.identities.create).not.toHaveBeenCalled();
});
