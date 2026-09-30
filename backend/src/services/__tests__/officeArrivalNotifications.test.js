import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),channel:vi.fn(),sender:vi.fn(),send:vi.fn(),kiosk:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>m}}));
vi.mock('../notificationPreferences.service.js',()=>({isNotificationChannelEnabled:m.channel}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:m.kiosk}}));
vi.mock('../emailSenderIdentityResolver.service.js',()=>({resolvePreferredSenderIdentityForAgency:m.sender}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../messagingJobLock.service.js',()=>({withMessagingJobLock:async(_,work)=>work()}));
import {arrivalRecipient,arrivalEmail,acknowledgeArrival,runOfficeArrivalTick,tokenHash} from '../officeArrivalNotifications.service.js';
let row,claim;
beforeEach(()=>{
 vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-30T12:01:30Z'));
 row={notification_id:12,user_id:7,agency_id:2,role:'provider',message:'Your 6am appointment is waiting.',email:'work@example.test',work_email:'sso@example.test',personal_email:'personal@example.test',is_active:1,created_at:new Date('2026-09-30T12:00:00Z')};claim=1;
 m.channel.mockResolvedValue(true);m.sender.mockResolvedValue({id:20,agency_id:2});m.send.mockResolvedValue({id:'gmail-id'});
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM office_arrival_deliveries d JOIN notifications'))return [[row]];
  if(sql.includes('FROM user_agencies'))return [[{ok:1}]];
  if(sql.startsWith('SELECT notification_id'))return [[{notification_id:12}]];
  return [{affectedRows:claim}];
 });
});
afterEach(()=>vi.useRealTimers());
it('uses SSO work email and password-login personal email',()=>{
 expect(arrivalRecipient(row)).toBe('sso@example.test');
 expect(arrivalRecipient({...row,sso_password_override:1})).toBe('personal@example.test');
 expect(arrivalRecipient({...row,sso_password_override:1,login_is_group_email:1,personal_email:null})).toBeNull();
});
it('escapes message HTML and offers action links without client answers',()=>{
 const mail=arrivalEmail({message:'Office <script>x</script>'},'a'.repeat(64));
 expect(mail.html).toContain('&lt;script&gt;');expect(mail.html).toContain('Keep check-ins in-app only');expect(mail.html).not.toContain('<script>');
 expect(tokenHash('a'.repeat(64))).toHaveLength(64);
});
it('sends branded identity mail with the provider account and unique message id',async()=>{
 await runOfficeArrivalTick();expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:20,userId:7,to:'sso@example.test',templateType:'kiosk_checkin',html:expect.stringContaining('Dismiss this arrival'),internetMessageIdOverride:'<office-arrival-12@plottwisthq.com>'}));
 expect(m.execute.mock.calls.some(([sql,args])=>sql.includes('email_status=?')&&args[0]==='sent')).toBe(true);
});
it('prefers the dedicated kiosk identity over a general agency sender',async()=>{
 m.kiosk.mockResolvedValue({id:42,agency_id:2});await runOfficeArrivalTick();
 expect(m.kiosk).toHaveBeenCalledWith(2,'kiosk');expect(m.sender).not.toHaveBeenCalled();expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:42}));
});
it.each(['acknowledged','read','opted out','inactive'])('suppresses email when %s',async reason=>{
 if(reason==='acknowledged')row.acknowledged_at=new Date();if(reason==='read')row.is_read=1;if(reason==='opted out')m.channel.mockResolvedValue(false);if(reason==='inactive')row.is_active=0;
 await runOfficeArrivalTick();expect(m.send).not.toHaveBeenCalled();
});
it('does not send if acknowledgment wins the claim race',async()=>{claim=0;await runOfficeArrivalTick();expect(m.send).not.toHaveBeenCalled();});
it('does not replay a stale arrival after downtime',async()=>{row.created_at=new Date('2026-09-29T12:00:00Z');await runOfficeArrivalTick();expect(m.send).not.toHaveBeenCalled();});
it('acknowledges only the owning provider and updates only check-in preferences',async()=>{
 await acknowledgeArrival(12,7,true);
 expect(m.execute.mock.calls[0][1]).toEqual([12,7]);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes("ON DUPLICATE KEY UPDATE in_app_enabled=1,email_enabled=0"))).toBe(true);
 expect(m.commit).toHaveBeenCalledOnce();
});
it('rejects another provider without changing preferences',async()=>{m.execute.mockResolvedValue([[]]);await expect(acknowledgeArrival(12,99,true)).rejects.toHaveProperty('status',404);expect(m.rollback).toHaveBeenCalledOnce();expect(m.commit).not.toHaveBeenCalled();});
it('marks an uncertain transport failure for inspection without automatic resend',async()=>{
 m.send.mockRejectedValue(Object.assign(new Error('timeout'),{code:'ETIMEDOUT'}));await runOfficeArrivalTick();
 expect(m.execute.mock.calls.some(([sql])=>sql.includes("email_status='sending' OR attempts>=3"))).toBe(true);
});
it('retries a known pre-send verification throttle after Gmail’s deadline',async()=>{
 m.send.mockRejectedValue(Object.assign(new Error('Gmail rate limit'),{code:'EMAIL_SENDER_TEMPORARY',retryAt:Date.parse('2026-09-30T13:11:40Z')}));
 await runOfficeArrivalTick();
 expect(m.execute.mock.calls.find(([sql])=>sql.includes("SET email_status='pending',last_error=?"))?.[1]).toEqual(['EMAIL_SENDER_TEMPORARY','2026-09-30 13:11:45',12]);
});
