import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import { createAttendanceLetterDelivery } from '../attendanceLetterDelivery.service.js';
import { attendanceLetterText } from '../../../../frontend/src/navigation/attendanceLetter.js';
let plan,db,service,m,rows,nextId;
const user={id:501,first_name:'Avery',role:'provider'};
beforeEach(()=>{
 nextId=1;rows=new Map();plan={id:17,agencyId:7,clientId:71,documentKey:'attendance-verification',version:1,currentVersion:1,contentHash:'a'.repeat(64),branding:{name:'Example practice'},data:{personLabel:'Example Client',appointmentDate:'2026-11-12',startTime:'10:00',endTime:'11:00',timezone:'America/Denver',location:'Example office',issuerName:'Avery Lane',issuerTitle:'Provider',attendanceStatus:'Confirmed attended',diagnosis:'NEVER SEND'},signers:[{id:9,kind:'clinician',userId:501,name:'Avery Lane',signedAt:'2026-11-12 18:00:00',evidence:{name:'Avery Lane'}}],recipients:[{id:902,kind:'guardian',name:'Parent Example'}]};
 m={read:vi.fn(async()=>plan),client:vi.fn(async()=>({id:71,agency_id:7})),recipient:vi.fn(async()=> 'Parent Example'),providerNumber:vi.fn(async()=>({numberId:8,from:'+13035550100',firstName:'Avery'})),smsPermission:vi.fn(async()=>({})),gate:vi.fn(async()=>({allowed:true})),share:vi.fn(async()=>({})),email:vi.fn(async()=>({id:'email-1'})),sms:vi.fn(async()=>({messageLog:{id:22}})),pdf:vi.fn(async()=>Buffer.from('signed-pdf')),log:vi.fn(async()=>{})};
 const execute=vi.fn(async(sql,args=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('FROM users'))return [[{id:902,email:'parent@example.test',phone:'+13035550101'}]];
  if(sql.includes('COUNT(*)'))return [[{count:1}]];
  if(sql.startsWith('SELECT id,action'))return [[...rows.values()].filter(row=>row.planId===args[0]&&row.version===args[1]&&(!args[2]||args.slice(2).includes(row.action))).sort((a,b)=>b.id-a.id).slice(0,args[2]?1:100)];
  if(sql.startsWith('INSERT INTO clinical_form_events')){const row={id:nextId++,planId:args[0],version:args[1],action:args[3],created_at:'2026-11-14 20:00:00'};rows.set(row.id,row);return [{insertId:row.id}];}
  return [{affectedRows:1}];
 });
 db={execute,getConnection:vi.fn(async()=>({execute,release:vi.fn()}))};service=createAttendanceLetterDelivery({db,directory:db,...m});
});
const send=channels=>service.deliver(user,17,{version:1,recipientKey:'user:902',channels,authorityConfirmed:true});
it('sends only the selected email with the signed PDF, without posting to the portal or texting',async()=>{
 expect(await send(['email'])).toMatchObject({deliveries:[{channel:'email',status:'sent'}]});expect(m.email).toHaveBeenCalledWith(expect.objectContaining({to:'parent@example.test',attachments:[expect.objectContaining({filename:'appointment-letter.pdf',contentBase64:Buffer.from('signed-pdf').toString('base64')})]}));expect(m.share).not.toHaveBeenCalled();expect(m.sms).not.toHaveBeenCalled();
});
it('posts a copy without queuing unselected email or SMS notifications',async()=>{
 await send(['portal']);expect(m.share).toHaveBeenCalledWith(user,17,expect.objectContaining({copyOnly:true,userId:902}),{notify:false});expect(m.email).not.toHaveBeenCalled();expect(m.sms).not.toHaveBeenCalled();
});
it('texts the complete signed letter using the explicit provider number and authorized recipient',async()=>{
 await send(['sms']);expect(m.sms).toHaveBeenCalledWith(expect.objectContaining({numberId:8,userId:501,relayRecipient:{guardianUserId:902,phone:'+13035550101'},body:expect.stringContaining('Electronically signed by Avery Lane')}));expect(m.sms.mock.calls[0][0].body).not.toContain('NEVER SEND');
});
it('returns individual results for a combination and never repeats an accepted or uncertain delivery',async()=>{
 m.sms.mockRejectedValue(Object.assign(new Error('timeout'),{status:502}));
 expect((await send(['email','portal','sms'])).deliveries.map(row=>[row.channel,row.status])).toEqual([['email','sent'],['portal','sent'],['sms','review']]);
 await send(['email','portal','sms']);expect(m.email).toHaveBeenCalledOnce();expect(m.share).toHaveBeenCalledOnce();expect(m.sms).toHaveBeenCalledOnce();
});
it('keeps accepted delivery authoritative if history projection fails',async()=>{
 m.log.mockRejectedValue(new Error('temporary history error'));expect(await send(['email'])).toMatchObject({deliveries:[{status:'sent'}]});
});
it('rejects an unsigned, stale, revoked or unauthorized letter before any delivery',async()=>{
 plan.signers=[];await expect(send(['email'])).rejects.toMatchObject({status:400});plan.signers=[{kind:'clinician',signedAt:'2026-11-12T18:00:00Z'}];plan.currentVersion=2;await expect(send(['email'])).rejects.toMatchObject({status:409});
 plan.currentVersion=1;plan.revocation={};await expect(send(['email'])).rejects.toMatchObject({status:400});plan.revocation=null;m.recipient.mockRejectedValue(Object.assign(new Error('access withdrawn'),{status:403}));await expect(send(['email'])).rejects.toMatchObject({status:403});expect(m.email).not.toHaveBeenCalled();
});
it('does not send a partial combination when a selected channel has no current consent',async()=>{
 m.smsPermission.mockRejectedValue(Object.assign(new Error('Text consent was withdrawn.'),{status:403}));await expect(send(['email','sms'])).rejects.toMatchObject({status:409});expect(m.email).not.toHaveBeenCalled();expect(m.sms).not.toHaveBeenCalled();
});
it('does not offer a company-number fallback as the provider’s assigned number',async()=>{
 m.providerNumber.mockResolvedValue(null);const options=await service.options(user,17);expect(options.recipients[0].channels).toMatchObject({email:true,portal:true,sms:false});await expect(send(['sms'])).rejects.toMatchObject({status:409});
});
it('distinguishes a planned appointment from verified attendance and retains a timezone-stable signature',()=>{
 expect(attendanceLetterText(plan).text).toContain('attended an appointment');expect(attendanceLetterText(plan).text).toMatch(/11:00\s+AM\s+MST/);plan.data.letterType='Scheduled appointment';expect(attendanceLetterText(plan).text).toContain('has an appointment scheduled');
});
it('bounds concurrent delivery work so signing and sharing can still acquire database connections',async()=>{
 m.read.mockImplementation(async(_,id)=>({...plan,id}));const pending=[];m.email.mockImplementation(()=>new Promise(resolve=>pending.push(resolve)));
 const requests=[17,18,19].map(id=>service.deliver(user,id,{version:1,recipientKey:'user:902',channels:['email'],authorityConfirmed:true}));
 await new Promise(resolve=>setTimeout(resolve,0));expect(m.email).toHaveBeenCalledTimes(2);
 pending[0]({id:'email-17'});await new Promise(resolve=>setTimeout(resolve,0));expect(m.email).toHaveBeenCalledTimes(3);
 pending[1]({id:'email-18'});pending[2]({id:'email-19'});expect((await Promise.all(requests)).every(result=>result.deliveries[0].status==='sent')).toBe(true);
});
