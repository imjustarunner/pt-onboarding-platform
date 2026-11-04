import {beforeEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {createSchoolFamilyStatusEmailWorker,schoolFamilyStatusEmailContext,schoolFamilyStatusMessage,SCHOOL_FAMILY_STATUS_TEMPLATE} from '../schoolFamilyStatusEmail.service.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
let job,context,contacts,records,d,worker,input;
beforeEach(()=>{
 context={client:{id:8,agency_id:2},school:{id:3,name:'School'},providers:[{id:5,first_name:'Provider',last_name:'Name'}],state:{agencyId:2,kind:'assigned',providerIds:[5],reason:null}};
 job={id:10,school_status_email_id:7,agency_id:2,client_id:8,school_organization_id:3,actor_user_id:555,revision:1,current_revision:1,
  source_agency_id:2,source_client_id:8,source_school_id:3,state_json:context.state,delivery_status:'pending',results_json:'{}'};
 job.state_hash=job.source_state_hash=job.current_state_hash=hash(JSON.stringify(context.state));
 contacts=[{key:'guardian:11',userId:11,email:'one@example.test',operationalOnly:true,source:'affiliated_guardian'},{key:'guardian:12',userId:12,email:'two@example.test',operationalOnly:true,source:'affiliated_guardian'}];records=new Map();
 const database={execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT id FROM school_family'))return [job.delivery_status==='pending'||job.delivery_status==='processing'?[{id:job.id}]:[]];
  if(sql.includes('FROM school_family_status_emails f'))return [[job]];
  if(sql.startsWith('SELECT GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('FROM user_communications'))return [[records.get(args[0])]];
  if(sql.includes('SET plan_json=')){job.plan_json=args[0];job.delivery_status='processing';}
  if(sql.includes('SET results_json='))job.results_json=args[0];
  if(sql.includes("SET delivery_status='processed'"))job.delivery_status='processed';
  if(sql.includes("SET delivery_status='obsolete'"))job.delivery_status='obsolete';
  return [{affectedRows:1}];
 }),getConnection:async()=>({...database,release:vi.fn()})};
 d={database,context:vi.fn(async()=>context),actor:vi.fn(async()=>true),contacts:vi.fn(async()=>({contacts,recipients:contacts})),allowed:vi.fn(async()=>true),
  encrypt:value=>'ENC:'+Buffer.from(value).toString('base64'),decrypt:value=>value?.startsWith('ENC:')?Buffer.from(value.slice(4),'base64').toString():value,
  emailContext:async()=>({brand:{name:'ITSCO',displayName:'SchoolCareBridge',products:[],replyTo:'support@itsco.health'}}),domain:async()=> 'itsco.health',
  mailbox:vi.fn(async()=>({identity:{id:9,agency_id:2,is_active:1}})),
  communication:vi.fn(async args=>{const id=records.size+100;records.set(id,{id,agency_id:args.agencyId,client_id:args.clientId,recipient_address:args.recipientAddress,
    generated_by_user_id:args.generatedByUserId,template_type:args.templateType,channel:args.channel,metadata:args.metadata});return {id};}),
  updateCommunication:vi.fn(),send:vi.fn(async args=>{await schoolFamilyStatusEmailContext(args,{...d,verifyEnvelope:true});return {id:'smtp-'+args.existingCommunicationId};})};
 worker=createSchoolFamilyStatusEmailWorker(d);
 input=()=>({agencyId:2,clientId:8,to:contacts[0].email,cc:['support@itsco.health'],templateType:SCHOOL_FAMILY_STATUS_TEMPLATE,existingCommunicationId:100});
});
it('sends independent individual family notices through the scoped messages identity and records their encrypted source snapshot',async()=>{
 expect(await worker()).toEqual([{id:10,status:'processed'}]);expect(d.send).toHaveBeenCalledTimes(2);
 expect(d.send.mock.calls.map(([args])=>args.to)).toEqual(['one@example.test','two@example.test']);
 expect(d.send.mock.calls[0][0]).toMatchObject({senderIdentityId:9,cc:['support@itsco.health'],replyToOverride:'support@itsco.health',fromDisplayNameOverride:'SchoolCareBridge'});
 expect(job.plan_json).not.toContain('one@example.test');expect(d.send.mock.calls[0][0].text).toContain('No appointment is created');
 expect(records.get(100).metadata).toMatchObject({schoolFamilyStatusJobId:10,schoolFamilyRecipientKey:hash('one@example.test')});
});
it('does not repeat accepted or uncertain recipients after an interrupted worker',async()=>{
 await worker();d.send.mockClear();job.delivery_status='processing';
 const results=JSON.parse(job.results_json);results[hash(contacts[1].email)].status='sending';job.results_json=JSON.stringify(results);
 await worker();expect(d.send).not.toHaveBeenCalled();expect(JSON.parse(job.results_json)[hash(contacts[1].email)].status).toBe('held');
});
it('records actual contact declines as skipped and missing source contacts as follow-up without attempting mail',async()=>{
 d.allowed.mockResolvedValue(false);await worker();expect(d.send).not.toHaveBeenCalled();expect(d.updateCommunication).toHaveBeenCalledWith(100,'skipped',null,null,expect.stringContaining('preferences'));
 job.delivery_status='pending';job.plan_json=null;job.results_json='{}';contacts=[];await worker();
 expect(d.communication).toHaveBeenLastCalledWith(expect.objectContaining({deliveryStatus:'skipped',subject:'School family update needs contact follow-up'}));
});
it('holds sender/transport failures visibly without repeating mail automatically',async()=>{
 d.mailbox.mockResolvedValue(null);await worker();expect(d.send).not.toHaveBeenCalled();expect(d.updateCommunication).toHaveBeenCalledWith(100,'flagged',null,null,expect.stringContaining('messages sender'));
 d.mailbox.mockClear();await worker();expect(d.mailbox).not.toHaveBeenCalled();
});
it('rejects raw class flags and binds retry to exact current source, recipient and agency',async()=>{
 await expect(schoolFamilyStatusEmailContext({templateType:SCHOOL_FAMILY_STATUS_TEMPLATE},{...d})).rejects.toThrow('saved school transition');
 await worker();expect(await schoolFamilyStatusEmailContext(input(),d)).toMatchObject({schoolFamilyStatus:true,actorUserId:555});
 for(const change of [{to:'outsider@example.test'},{clientId:9},{agencyId:4}])await expect(schoolFamilyStatusEmailContext({...input(),...change},d)).rejects.toThrow();
 job.current_revision=2;await expect(schoolFamilyStatusEmailContext(input(),d)).rejects.toThrow('no longer current');
});
it('rechecks removed/revoked or changed caregiver contact permissions on manual retry',async()=>{
 await worker();d.allowed.mockResolvedValue(false);
 await expect(schoolFamilyStatusEmailContext(input(),d)).rejects.toThrow('permission changed');
});
it('cannot release a persisted family notice after its staff actor loses the required authorization',async()=>{
 await worker();d.actor.mockResolvedValue(false);
 await expect(schoolFamilyStatusEmailContext(input(),d)).rejects.toThrow('no longer current');
});
it.each([{cc:['other@example.test']},{cc:[]},{bcc:['other@example.test']}])('rejects actual or persisted copy tampering %j',async change=>{
 await worker();await expect(schoolFamilyStatusEmailContext({...input(),...change},{...d,verifyEnvelope:true})).rejects.toThrow('support mailbox');
 Object.assign(records.get(100).metadata,change);
 await expect(schoolFamilyStatusEmailContext(input(),{...d,verifyEnvelope:true})).rejects.toThrow('support mailbox');
});
it('does not include a staff-only waitlist reason in family email',()=>{
 context.state={...context.state,kind:'waitlist',reason:'Private clinical discussion'};
 const message=schoolFamilyStatusMessage(context);expect(message.text).toContain('waitlist');expect(message.text).not.toContain('Private clinical');
});
