import {beforeEach,expect,it,vi} from 'vitest';
import crypto from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../sessionNotification.service.js',()=>({loadClientConsent:vi.fn()}));
vi.mock('../appointmentReply.service.js',()=>({applyAppointmentReply:vi.fn()}));
import {createSessionNotificationEmailReplies} from '../sessionNotificationEmailReplies.service.js';
const receipt={id:1,appointment_id:12,agency_id:377,client_id:9,guardian_user_id:5,reminder_id:7};
const reply={fromEmail:'dad@example.test',inReplyTo:'<notice@example.test>',messageId:'<reply@example.test>',subject:'Re: Session reminder',bodyText:'Y',gmailPayload:{headers:[{name:'From',value:'Dad <dad@example.test>'},{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.test'}]}};
let db,conn,apply,log,consent,service,claim;
beforeEach(()=>{
 claim={affectedRows:1};
 conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.includes('INSERT IGNORE')?[claim]:[{affectedRows:1}])};
 db={getConnection:vi.fn(async()=>conn),execute:vi.fn(async(sql,args)=>sql.startsWith('SELECT')?[args.at(-1)===crypto.createHash('sha256').update('dad@example.test').digest('hex')?[receipt]:[]]:[{affectedRows:1}])};
 apply=vi.fn(async()=>({status:'applied'}));log=vi.fn(async()=>({id:31}));consent=vi.fn(async()=>({emailAddress:'dad@example.test'}));service=createSessionNotificationEmailReplies({db,apply,log,consent});
});
it('correlates an authenticated Y reply to the exact session, recipient and reminder',async()=>{
 expect(await service(reply)).toEqual({matched:true,actionStatus:'applied'});
 expect(apply).toHaveBeenCalledWith({appointmentId:12,agencyId:377,clientId:9,guardianUserId:5,channel:'email',rawBody:'Y',autoApply:true});expect(conn.commit).toHaveBeenCalled();
});
it('retains free text and strips quoted notification text without treating a phrase as N',async()=>{
 await service({...reply,bodyText:'No problem, see you there!\n\nOn Friday Staff wrote:\n> Reply Y to confirm'});
 expect(apply).not.toHaveBeenCalled();expect(log.mock.calls[0][0]).toMatchObject({kind:'notification_reply',metadata:{body:'No problem, see you there!',deliveryStatus:'received',needsSupport:true}});
});
it('keeps an unauthenticated reply for review without changing RSVP',async()=>{
 await service({...reply,gmailPayload:{headers:[{name:'From',value:'dad@example.test'},{name:'Authentication-Results',value:'mx.google.com; dmarc=fail header.from=example.test'}]}});expect(log).toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();
});
it('does not attach mail from a different sender or infer a session from its subject',async()=>{
 expect(await service({...reply,fromEmail:'other@example.test'})).toEqual({matched:false});
 expect(await service({...reply,inReplyTo:null,subject:'Session 12'})).toEqual({matched:false});expect(log).not.toHaveBeenCalled();
});
it('does not apply an action when the account now uses a different email',async()=>{
 consent.mockResolvedValue({emailAddress:'new@example.test'});await service(reply);expect(apply).not.toHaveBeenCalled();expect(log).toHaveBeenCalled();
});
it('does not log or apply an inbound message twice',async()=>{
 claim.affectedRows=0;expect(await service(reply)).toMatchObject({matched:true,duplicate:true});expect(log).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();
});
it('leaves a reply with ancestors from different sessions in the inbox for review',async()=>{
 db.execute.mockResolvedValue([[receipt,{...receipt,appointment_id:13}]]);expect(await service(reply)).toEqual({matched:false});expect(log).not.toHaveBeenCalled();
});
