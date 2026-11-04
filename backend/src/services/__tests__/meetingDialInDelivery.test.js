import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),db:vi.fn(),release:vi.fn(),context:vi.fn(),personal:vi.fn(),email:vi.fn(),registered:vi.fn(),sender:vi.fn(),prepare:vi.fn(),sms:vi.fn(),log:vi.fn(),status:vi.fn(),campaign:vi.fn(),enabled:true,prior:null}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.db,release:m.release})}}));
vi.mock('../meetingDialIn.service.js',()=>({personalDialIn:m.personal}));
vi.mock('../meetingDialInContext.service.js',()=>({dialInContext:m.context}));
vi.mock('../meetingDialInPolicy.js',async original=>({...await original(),dialInConfigured:()=>m.enabled}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async({user})=>({email:user.work_email || user.email})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:m.email}));
vi.mock('../smsCompliance.service.js',()=>({resolveRegisteredSmsSender:m.registered,getSmsSender:m.sender,prepareSmsDelivery:m.prepare}));
vi.mock('../../utils/companyEventSms.js',()=>({assertCompanyEventSmsCampaign:m.campaign}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:m.sms}}));
vi.mock('../../models/NotificationSmsLog.model.js',()=>({default:{create:m.log,updateStatus:m.status}}));
import { sendMeetingDialIn } from '../meetingDialInDelivery.service.js';
const request={type:'supervision',meetingId:5,actorUserId:7,userId:8,channel:'email',requestKey:'01234567-1234-4234-8234-012345678901'};
const target={type:'supervision',isHost:false,meeting:{id:5,agency_id:2,title:'Private staff session'},user:{id:8,email:'personal@example.test',work_email:'work@example.test',personal_phone:'invalid',work_phone:'+12025550108'},name:'Participant'};
beforeEach(()=>{
  for(const fn of Object.values(m))if(typeof fn==='function')fn.mockReset();m.enabled=true;m.prior=null;
  m.context.mockImplementation(async(_type,_id,userId)=>({...target,isHost:userId===7,user:{...target.user,id:userId}}));
  m.personal.mockResolvedValue({invitationId:11,text:'Private telephone invitation',name:'Participant',pin:'0123456789'});
  m.db.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT *')?[[...(m.prior?[m.prior]:[])]]:sql.includes('COUNT(*)')?[[{count:0}]]:sql.includes('INSERT IGNORE')?[{affectedRows:1,insertId:50}]:[[]]);
  m.execute.mockResolvedValue([{affectedRows:1}]);m.email.mockResolvedValue({id:'mail-accepted'});m.registered.mockResolvedValue('+12025550100');m.sender.mockResolvedValue({agency_id:2});m.prepare.mockResolvedValue({});m.sms.mockResolvedValue({sid:'sms-accepted'});m.log.mockResolvedValue({id:40});m.status.mockResolvedValue({});
});
afterEach(()=>vi.unstubAllEnvs());
describe('private phone invitation delivery',()=>{
  it('does no receipt writes or carrier work when dedicated meeting configuration is missing',async()=>{
    m.enabled=false;await expect(sendMeetingDialIn(request)).rejects.toMatchObject({status:503});
    expect(m.context).not.toHaveBeenCalled();expect(m.db).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();expect(m.sms).not.toHaveBeenCalled();
  });
  it('rejects an attendee sharing another account invitation before creating credentials or receipts',async()=>{
    m.context.mockResolvedValue({...target,isHost:false});await expect(sendMeetingDialIn(request)).rejects.toMatchObject({status:403});
    expect(m.personal).not.toHaveBeenCalled();expect(m.db).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();
  });
  it('resolves the current work recipient and sends only that selected account private invitation',async()=>{
    expect(await sendMeetingDialIn(request)).toEqual({status:'sent'});
    expect(m.email).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,to:'work@example.test',userId:8,generatedByUserId:7,text:'Private telephone invitation',source:'manual'}));
    expect(m.execute).toHaveBeenCalledWith('UPDATE meeting_dial_in_deliveries SET status=? WHERE id=?',['sent',50]);
  });
  it.each([[{pendingApproval:true},'pending'],[{skipped:true},'skipped'],[{},'review'],[{id:'test-accepted',redirected:true},'redirected']])('does not claim acceptance for held, skipped or uncertain email (%j)',async(result,status)=>{
    m.email.mockResolvedValue(result);expect(await sendMeetingDialIn(request)).toEqual({status});
  });
  it('does not replay an already accepted request',async()=>{
    m.prior={invitation_id:11,channel:'email',status:'sent'};expect(await sendMeetingDialIn(request)).toEqual({status:'sent',duplicate:true});expect(m.email).not.toHaveBeenCalled();
  });
  it('rejects a reused request id for another recipient or channel',async()=>{
    m.prior={invitation_id:99,channel:'email',status:'sent'};await expect(sendMeetingDialIn(request)).rejects.toMatchObject({status:409});expect(m.email).not.toHaveBeenCalled();
  });
  it('rechecks current host permission after saving a delivery claim',async()=>{
    m.context.mockImplementation(async(_type,_id,userId)=>({...target,isHost:userId===7 && m.context.mock.calls.length<3}));
    await expect(sendMeetingDialIn(request)).rejects.toMatchObject({status:403});expect(m.email).not.toHaveBeenCalled();
  });
  it('refuses a credential from a changed occurrence before sending',async()=>{
    m.personal.mockResolvedValueOnce({invitationId:11,text:'old'}).mockResolvedValue({invitationId:12,text:'new'});
    await expect(sendMeetingDialIn(request)).rejects.toMatchObject({status:409});expect(m.email).not.toHaveBeenCalled();
  });
  it('uses a valid saved fallback mobile and the agency registered polling/workforce sender',async()=>{
    expect(await sendMeetingDialIn({...request,channel:'sms'})).toEqual({status:'sent'});
    expect(m.registered).toHaveBeenCalledWith({agencyId:2,purpose:'workforce',requiredPurpose:'polling'});
    expect(m.campaign).toHaveBeenCalledWith({agency_id:2},'staff','workforce');
    expect(m.prepare).toHaveBeenCalledWith(expect.objectContaining({to:'+12025550108',from:'+12025550100',agencyId:2,purpose:'workforce',staffNotificationKind:'notifications'}));
    expect(m.sms).toHaveBeenCalledWith(expect.objectContaining({to:'+12025550108'}));
  });
  it('preserves current SMS opt-outs and never sends after compliance denies',async()=>{
    m.prepare.mockRejectedValue(Object.assign(new Error('Recipient opted out.'),{code:'sms_opted_out',status:409}));
    await expect(sendMeetingDialIn({...request,channel:'sms'})).rejects.toMatchObject({code:'sms_opted_out'});expect(m.sms).not.toHaveBeenCalled();expect(m.log).not.toHaveBeenCalled();
  });
  it('does not substitute an office/default sender when the registered staff sender is unavailable',async()=>{
    m.registered.mockResolvedValue(null);await expect(sendMeetingDialIn({...request,channel:'sms'})).rejects.toThrow('Staff texting is not configured');expect(m.sms).not.toHaveBeenCalled();
  });
  it('detects a changed mobile after consent preparation instead of delivering the PIN to a stale address',async()=>{
    m.prepare.mockImplementation(async()=>{m.context.mockResolvedValue({...target,user:{...target.user,work_phone:'+12025550109'}});});
    await expect(sendMeetingDialIn({...request,channel:'sms'})).rejects.toMatchObject({status:409});expect(m.sms).not.toHaveBeenCalled();
  });
});
