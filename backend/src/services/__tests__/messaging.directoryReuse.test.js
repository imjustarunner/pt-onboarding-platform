import { expect,it,vi } from 'vitest';
import Directory from '../googleWorkspaceDirectory.service.js';
it('reuses the job Directory client and verified nested member type',async()=>{
 const getClient=vi.spyOn(Directory,'getClient').mockRejectedValue(new Error('unexpected authentication'));
 const getGroup=vi.spyOn(Directory,'getGroup').mockRejectedValue(new Error('unexpected lookup'));
 const client={members:{insert:vi.fn(async args=>({data:args.requestBody})),list:vi.fn(async()=>({data:{members:[]}})),patch:vi.fn(async()=>({data:{}})),delete:vi.fn(async()=>({}))}};
 const result=await Directory.addGroupMember({groupEmail:'staff@example.org',memberEmail:'app-only@example.org',role:'MANAGER',memberType:'GROUP',client});
 expect(result).toMatchObject({role:'MEMBER',nestedGroup:true,roleDowngraded:true});
 expect(client.members.insert).toHaveBeenCalledWith(expect.objectContaining({requestBody:expect.objectContaining({type:'GROUP',role:'MEMBER'})}));
 await Directory.listGroupMembers('staff@example.org',{client});
 await Directory.setGroupMemberDeliverySettings({groupEmail:'staff@example.org',memberEmail:'app-only@example.org',deliverySettings:'ALL_MAIL',client});
 await Directory.removeGroupMember({groupEmail:'staff@example.org',memberEmail:'app-only@example.org',client});
 expect(getClient).not.toHaveBeenCalled();expect(getGroup).not.toHaveBeenCalled();
});
