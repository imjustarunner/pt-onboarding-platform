import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {readSessionReminderDefaults,saveSessionReminderDefaults,organizationReminderRules} from '../sessionReminderDefaults.service.js';
import {normalizeCustomSessionReminders} from '../appointmentNotificationCustomization.service.js';
const rules=[{id:'five-hours',channels:['email','sms','in_app'],offsetMinutes:300,message:'',askConfirmation:true}];
it('stores personal defaults under the authenticated owner and agency',async()=>{
 const db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])};expect(await saveSessionReminderDefaults(377,501,rules,501,db)).toEqual(rules);
 expect(db.execute.mock.calls[0][1]).toEqual([377,501,JSON.stringify(rules),501]);
});
it('reads organization and personal defaults independently',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{rules_json:JSON.stringify(rules)}]])};
 expect(await readSessionReminderDefaults(377,501,db)).toEqual(rules);await readSessionReminderDefaults(377,0,db);
 expect(db.execute.mock.calls.map(call=>call[1])).toEqual([[377,501],[377,0]]);
});
it('uses 72/24/2 hours for an organization that still has the original default',()=>{
 const result=organizationReminderRules({standardReminder:{enabled:true,offsetValue:24,offsetUnit:'hours',channels:['email']}});
 expect(result.map(rule=>[rule.offsetMinutes,rule.channels])).toEqual([[4320,['email']],[1440,['email','sms']],[120,['email','sms']]]);
});
it('preserves an explicitly customized organization schedule',()=>{
 expect(organizationReminderRules({standardReminder:{enabled:true,offsetValue:5,offsetUnit:'hours',channels:['sms']}})).toEqual([expect.objectContaining({offsetMinutes:300,channels:['sms']})]);
 expect(organizationReminderRules({},rules)).toBe(rules);
});
it('supports all three channels in a five-minute custom reminder and rejects empty or unknown channels',()=>{
 expect(normalizeCustomSessionReminders([{...rules[0],offsetMinutes:5}])).toEqual([{...rules[0],offsetMinutes:5}]);
 for(const channels of [[],['fax']])expect(()=>normalizeCustomSessionReminders([{...rules[0],channels}])).toThrow('Choose email');
});
it('does not write an empty personal default',async()=>{
 const db={execute:vi.fn()};await expect(saveSessionReminderDefaults(377,501,[],501,db)).rejects.toMatchObject({status:400});expect(db.execute).not.toHaveBeenCalled();
});
it('does not replace an unsupported legacy phone-only schedule with unsolicited email defaults',()=>{
 expect(organizationReminderRules({standardReminder:{channels:['phone'],offsetValue:24,offsetUnit:'hours'}})).toEqual([]);
});
