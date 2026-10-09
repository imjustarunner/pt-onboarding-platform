import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(),getAgencies:vi.fn()}}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:vi.fn(),decryptChatText:vi.fn(e=>e.cipher)}));
import pool from '../../config/database.js';import User from '../../models/User.model.js';
import {handleStaffSmsAssistant,getStaffSmsRequest} from '../staffSmsAssistant.service.js';
import {parseStaffSmsRequest,ITSCO_STAFF_ASSISTANT_NUMBER} from '../../utils/staffSmsAssistant.js';
import {phoneFingerprint} from '../../utils/staffCommunicationChoices.js';
let d,staff,prior,recent,db;
const incoming={from:'+17195550101',to:ITSCO_STAFF_ASSISTANT_NUMBER,body:'What was my last pay?',messageId:'m1'};
const registration={brandId:'B1',campaignId:'C1',resellerId:'R1',brandName:'ITSCO',legalName:'ITSCO, LLC',supportContact:'support@itsco.health',website:'https://itsco.health',privacyUrl:'https://itsco.health/privacy',termsUrl:'https://itsco.health/terms',evidenceUrl:'https://itsco.health/proof',purposes:['workforce','polling'],keywordOwner:'application',approved:true,numberLinked:true};
beforeEach(()=>{
 vi.clearAllMocks();prior=[];recent=[];staff=[{id:7,role:'provider',is_active:1,is_archived:0,notification_categories:{staff_communications_2:{phoneHash:phoneFingerprint(incoming.from),accessRequests:{staffSmsAssistant:true}}}}];
 db={release:vi.fn(),execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('requestKey')?[prior]:sql.includes('INTERVAL 1 MINUTE')?[recent]:[[]])};
 d={db:{execute:vi.fn(async()=>[staff]),getConnection:vi.fn(async()=>db)},sender:vi.fn(async()=>({id:3,agency_id:2,registration})),suppressed:vi.fn(async()=>false),agency:vi.fn(async()=>({id:2,name:'ITSCO',slug:'itsco'})),send:vi.fn(),encrypt:vi.fn(s=>({cipher:s})),evidence:vi.fn(async()=> '11111111-1111-4111-8111-111111111111'),capability:vi.fn(v=>v)};
});
it('does not consume votes, STOP, HELP or clinical-number messages',async()=>{
 for(const body of ['Y','1','SUPPORT','STOP','HELP']){expect(parseStaffSmsRequest(body)).toBeNull();expect(await handleStaffSmsAssistant({...incoming,body},d)).toBe(false);}
 expect(await handleStaffSmsAssistant({...incoming,to:'+17195550199'},d)).toBe(false);expect(d.send).not.toHaveBeenCalled();
});
it('returns only a login-required request link and never pay/client contents or an executed action',async()=>{
 expect(await handleStaffSmsAssistant(incoming,d)).toBe(true);expect(d.encrypt).toHaveBeenCalledWith(JSON.stringify({prompt:incoming.body}));
 const sent=d.send.mock.calls[0][0];expect(sent.purpose).toBe('workforce');expect(sent.body).toContain('/staff-text-assistant/');expect(sent.body).not.toContain(incoming.body);expect(sent.body).toContain('Nothing has been sent or scheduled');
 expect(d.capability).toHaveBeenCalledWith(expect.objectContaining({messageId:'m1'}));expect(d.db.execute.mock.calls.some(([sql])=>sql.includes('sms_recipient_permissions'))).toBe(false);
});
it('does not store the private request until the staff preference is enabled; MENU remains instructions only',async()=>{
 staff[0].notification_categories.staff_communications_2.accessRequests.staffSmsAssistant=false;
 await handleStaffSmsAssistant(incoming,d);expect(d.encrypt).not.toHaveBeenCalled();expect(d.send.mock.calls[0][0].body).toContain('Enable Staff');
 d.send.mockClear();await handleStaffSmsAssistant({...incoming,body:'MENU'},d);expect(d.send.mock.calls[0][0].body).not.toContain('/staff-text-assistant/');
});
it('fails closed for STOP, unknown/shared phones, inactive staff, duplicate webhooks and throttled bursts',async()=>{
 d.suppressed.mockResolvedValueOnce(true);await handleStaffSmsAssistant(incoming,d);expect(d.send).not.toHaveBeenCalled();
 staff.push({...staff[0],id:8});await handleStaffSmsAssistant(incoming,d);expect(d.send).not.toHaveBeenCalled();staff.pop();
 staff[0].is_active=0;await handleStaffSmsAssistant(incoming,d);expect(d.send).not.toHaveBeenCalled();staff[0].is_active=1;
 prior=[{event_id:'old'}];await handleStaffSmsAssistant(incoming,d);expect(d.send).not.toHaveBeenCalled();prior=[];recent=Array(5).fill({event_id:'old'});await handleStaffSmsAssistant(incoming,d);expect(d.send).not.toHaveBeenCalled();
});
it('never exposes someone else’s request and checks current agency membership',async()=>{
 const id='11111111-1111-4111-8111-111111111111';pool.execute.mockResolvedValueOnce([[]]);await expect(getStaffSmsRequest({id:8},id)).rejects.toMatchObject({status:404});expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('user_id=?'),[id,8]);
 pool.execute.mockResolvedValue([[{details:{enabled:true,agencyId:2,envelope:{cipher:JSON.stringify({prompt:'My tasks'})}},occurred_at:new Date()}]]);User.findById.mockResolvedValue({id:7,role:'provider',is_active:1});User.getAgencies.mockResolvedValue([{id:99}]);await expect(getStaffSmsRequest({id:7},id)).rejects.toMatchObject({status:404});
 User.getAgencies.mockResolvedValue([{id:2}]);expect((await getStaffSmsRequest({id:7},id)).prompt).toBe('My tasks');
});
