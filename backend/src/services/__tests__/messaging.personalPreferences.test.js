import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:()=>{}}));
import pool from '../../config/database.js';
import {getCommunicationPrefs,updateCommunicationPrefs} from '../inboxDigest.service.js';
let row;
beforeEach(()=>{vi.clearAllMocks();row=null;pool.execute.mockImplementation(async(sql,args)=>{
 if(sql.startsWith('SELECT *'))return [row?[row]:[]];
 if(sql.includes('INSERT INTO user_communication_prefs')){
  expect((sql.match(/\?/g)||[]).length).toBe(args.length);
  row={user_id:args[0],personal_email_notify:args[1],digest_hours:args[2],digest_business_hours:args[3],personal_email_delivery_mode:args[4],personal_email_delay_mode:args[5],personal_email_delay_hours:args[6]};return [{affectedRows:1}];
 }
 throw new Error('Unexpected query');
});});
it('defaults to enabled, notification-only, 24 business-day hours',async()=>{
 expect(await getCommunicationPrefs(5)).toMatchObject({personalEmailNotify:true,personalEmailDeliveryMode:'notification',personalEmailDelayMode:'business_day',personalEmailDelayHours:24});
});
it('persists opt-out, immediate delivery, and forwarding independently',async()=>{
 expect(await updateCommunicationPrefs(5,{personalEmailNotify:false,personalEmailDelayMode:'immediate',personalEmailDeliveryMode:'forward_one_to_one'})).toMatchObject({personalEmailNotify:false,personalEmailDelayMode:'immediate',personalEmailDeliveryMode:'forward_one_to_one'});
 expect(await updateCommunicationPrefs(5,{personalEmailNotify:true,personalEmailDelayMode:'hours',personalEmailDelayHours:3})).toMatchObject({personalEmailNotify:true,personalEmailDelayHours:3,personalEmailDeliveryMode:'forward_one_to_one'});
});
it('retains an existing opt-out and legacy delay after migration',async()=>{
 row={personal_email_notify:0,digest_hours:48};expect(await getCommunicationPrefs(5)).toMatchObject({personalEmailNotify:false,personalEmailDelayHours:48,personalEmailDeliveryMode:'notification'});
});
it('rejects invalid settings before writing anything',async()=>{
 for(const patch of [{personalEmailDelayHours:0},{personalEmailDelayHours:169},{personalEmailDelayHours:1.2},{personalEmailDelayHours:'2'},{personalEmailDelayMode:'invalid'},{personalEmailDeliveryMode:'forward_all'},{personalEmailNotify:'false'}])await expect(updateCommunicationPrefs(5,patch)).rejects.toMatchObject({status:400});
 expect(pool.execute).not.toHaveBeenCalled();
});
