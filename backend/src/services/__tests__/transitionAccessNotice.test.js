import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),release:vi.fn(),grant:vi.fn(),practices:vi.fn(),prepare:vi.fn(),sender:vi.fn(),sms:vi.fn(),email:vi.fn(),log:vi.fn(),status:vi.fn(),claimed:false,markers:[],smsEnabled:1,choice:true}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,release:m.release})}}));
vi.mock('../schedulingWorkerGate.js',()=>({canRunMeetingPhoneMaintenance:async()=>true}));
vi.mock('../transitionClientImportAccess.service.js',()=>({hasTransitionClientImportAccess:m.grant}));
vi.mock('../transitionWorkspace.service.js',()=>({transitionPractices:m.practices}));
vi.mock('../../models/User.model.js',()=>({default:{normalizePhone:p=>p}}));
vi.mock('../../utils/staffCommunicationChoices.js',()=>({phoneFingerprint:p=>'hash:'+p}));
vi.mock('../smsCompliance.service.js',()=>({prepareSmsDelivery:m.prepare,resolveRegisteredSmsSender:m.sender}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:m.sms}}));
vi.mock('../../models/NotificationSmsLog.model.js',()=>({default:{create:m.log,updateStatus:m.status}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.email}));
import {processTransitionAccessNotices} from '../transitionAccessNotice.service.js';
beforeEach(()=>{
 vi.clearAllMocks();m.claimed=false;m.markers=[];m.smsEnabled=1;m.choice=true;m.grant.mockResolvedValue(true);m.practices.mockResolvedValue([{id:2},{id:6}]);m.prepare.mockResolvedValue({});m.sender.mockResolvedValue('+15555550100');m.sms.mockResolvedValue({sid:'sms-receipt'});m.email.mockResolvedValue({id:'email-receipt'});m.log.mockResolvedValue({id:8});
 m.execute.mockImplementation(async(sql,params=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('FROM user_activity_log r'))return [m.claimed?[]:[{id:7,agency_id:2,metadata:JSON.stringify({targetUserId:55})}]];
  if(sql.includes('INSERT INTO user_activity_log')){m.markers.push({action:params[0],metadata:JSON.parse(params[2])});if(params[0].endsWith('_processing'))m.claimed=true;expect(sql).toContain('VALUES(?,NULL,?');return [{insertId:9}];}
  if(sql.includes('FROM users WHERE'))return [[{id:55,role:'provider_plus',personal_phone:'+15555550101',work_email:'synthetic@example.test'}]];
  if(sql.includes('FROM user_preferences'))return [[{sms_enabled:m.smsEnabled,notification_categories:{staff_communications_2:{phoneHash:'hash:+15555550101',choices:{notifications:m.choice}}}}]];
  if(sql.includes('FROM email_sender_identities'))return [[{id:4}]];
  if(sql.includes('RELEASE_LOCK'))return [[]];throw Error('Unexpected test query');
 });
});
it('sends through the normal app SMS policy and records an automation receipt once',async()=>{
 expect(await processTransitionAccessNotices()).toEqual({sent:1,review:0});expect(m.prepare).toHaveBeenCalled();expect(m.sms).toHaveBeenCalledWith(expect.objectContaining({purpose:'workforce',staffNotificationKind:'notifications',agencyId:2}));
 expect(m.email).not.toHaveBeenCalled();expect(m.markers.at(-1)).toMatchObject({action:'practice_transition_access_notice_sent',metadata:{actorType:'automation',channel:'sms',reference:'sms-receipt'}});
 expect(await processTransitionAccessNotices()).toEqual({sent:0,review:0});expect(m.sms).toHaveBeenCalledTimes(1);
});
it('uses email when staff texts are off, the category is off or consent policy rejects texting',async()=>{
 for(const option of ['global','category','stop']){
  m.claimed=false;m.sms.mockClear();m.email.mockClear();m.smsEnabled=option==='global'?0:1;m.choice=option!=='category';
  m.prepare.mockImplementation(async()=>{if(option==='stop')throw Object.assign(Error('STOP'),{code:'sms_opted_out'});return {};});
  expect(await processTransitionAccessNotices()).toEqual({sent:1,review:0});expect(m.sms).not.toHaveBeenCalled();expect(m.email).toHaveBeenCalledWith(expect.objectContaining({generatedByUserId:null,to:'synthetic@example.test'}));
 }
});
it('holds unknown carrier results without sending email or automatically retrying',async()=>{
 m.sms.mockRejectedValue(new Error('Unknown carrier result'));expect(await processTransitionAccessNotices()).toEqual({sent:0,review:1});expect(m.email).not.toHaveBeenCalled();expect(m.markers.at(-1).action).toBe('practice_transition_access_notice_review');
 expect(await processTransitionAccessNotices()).toEqual({sent:0,review:0});expect(m.sms).toHaveBeenCalledTimes(1);
});
it('does not announce revoked grants or run from an unverified revision',async()=>{
 m.grant.mockResolvedValue(false);expect(await processTransitionAccessNotices()).toEqual({sent:0,review:1});expect(m.sms).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();
 m.execute.mockClear();expect(await processTransitionAccessNotices({gate:async()=>false})).toEqual({inactiveRevision:true});expect(m.execute).not.toHaveBeenCalled();
});
