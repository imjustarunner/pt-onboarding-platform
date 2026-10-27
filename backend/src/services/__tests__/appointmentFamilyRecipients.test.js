import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {appointmentFamilyRecipients} from '../appointmentFamilyRecipients.service.js';
it('keeps the two authorized guardians and excludes restricted/revoked links',async()=>{
 const authorize=vi.fn(async id=>{if(id===2)throw Object.assign(Error('Restricted'),{status:403});});
 const result=await appointmentFamilyRecipients(8,450,{guardians:async()=>[1,2,3,4].map(id=>({guardian_user_id:id,access_enabled:id===3?0:1,email:`g${id}@example.test`,phone:'+16189107000'})),authorize});
 expect(result.hasRelationships).toBe(true);expect(result.recipients.map(r=>r.userId)).toEqual([1,4]);expect(authorize).toHaveBeenCalledWith(1,8,{agencyId:450});
});
it('does not fall back to a client phone when every relationship is restricted',async()=>{
 const result=await appointmentFamilyRecipients(8,450,{guardians:async()=>[{guardian_user_id:1,access_enabled:0}],authorize:vi.fn()});expect(result).toEqual({hasRelationships:true,recipients:[]});
});
it('propagates an unavailable authorization service instead of sending to a fallback recipient',async()=>{
 await expect(appointmentFamilyRecipients(8,450,{guardians:async()=>[{guardian_user_id:1,access_enabled:1}],authorize:async()=>{throw Error('Database unavailable');}})).rejects.toThrow('Database unavailable');
});
