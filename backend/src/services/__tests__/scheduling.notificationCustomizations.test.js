import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),settings:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../sessionNotification.service.js',()=>({getTenantSettings:m.settings,resolveEffectiveChannels:()=>({email:true,sms:false,in_app:true})}));
import {normalizeCustomSessionReminders,readAppointmentNotificationRules,saveAppointmentNotificationRules,validateCustomReminderChannels} from '../appointmentNotificationCustomization.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);m.settings.mockResolvedValue({platform:{},channelsEnabled:{}});});
it('rejects invalid rules before writing any settings',async()=>{
 for(const rules of [[{channel:'email',offsetMinutes:0}],[{channel:'email',offsetMinutes:10081}],[{channel:'email',offsetMinutes:60,message:'x'.repeat(1001)}],[{channel:'fax',offsetMinutes:60}],Array.from({length:13},()=>({channel:'email',offsetMinutes:60}))]){
  expect(()=>normalizeCustomSessionReminders(rules)).toThrow();await expect(saveAppointmentNotificationRules(8,377,rules,501)).rejects.toThrow();
 }
 expect(m.execute).not.toHaveBeenCalled();
});
it('enforces enabled agency channels before creating a custom reminder',async()=>{
 await expect(validateCustomReminderChannels(377,[{channel:'sms'}])).rejects.toMatchObject({status:400});
 await expect(validateCustomReminderChannels(377,[{channel:'email'}])).resolves.toBeUndefined();
});
it('stores normalized choices against the appointment’s exact agency and reads them back',async()=>{
 const rules=[{id:'extra',channel:'email',offsetMinutes:60,message:' Arrive early ',askConfirmation:false}];
 const normalized=await saveAppointmentNotificationRules(8,377,rules,501);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('SELECT id,agency_id'),[JSON.stringify(normalized),501,8,377]);
 m.execute.mockResolvedValue([[{rules_json:JSON.stringify(normalized)}]]);expect(await readAppointmentNotificationRules(8,377)).toEqual(normalized);
 expect(m.execute).toHaveBeenLastCalledWith(expect.stringContaining('appointment_id=? AND agency_id=?'),[8,377]);
});
