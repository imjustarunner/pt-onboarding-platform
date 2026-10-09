import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(),getAgencies:vi.fn()}}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:vi.fn(),decryptChatText:vi.fn(e=>e.cipher)}));
import pool from '../../config/database.js';import User from '../../models/User.model.js';
import {handleStaffSmsAssistant,getStaffSmsRequest} from '../staffSmsAssistant.service.js';
import {parseStaffSmsRequest,ITSCO_STAFF_ASSISTANT_NUMBER,STAFF_SMS_COMMAND_VERSION} from '../../utils/staffSmsAssistant.js';
import {phoneFingerprint} from '../../utils/staffCommunicationChoices.js';
let d,staff,prior,recent,db;
const incoming={from:'+17195550101',to:ITSCO_STAFF_ASSISTANT_NUMBER,body:'#task Update the Kudos page and incorporate a menu',messageId:'m1'};
const registration={brandId:'B1',campaignId:'C1',resellerId:'R1',brandName:'ITSCO',legalName:'ITSCO, LLC',supportContact:'support@itsco.health',website:'https://itsco.health',privacyUrl:'https://itsco.health/privacy',termsUrl:'https://itsco.health/terms',evidenceUrl:'https://itsco.health/proof',purposes:['workforce','polling'],keywordOwner:'application',approved:true,numberLinked:true};
beforeEach(()=>{
 vi.clearAllMocks();prior=[];recent=[];staff=[{id:7,role:'provider',is_active:1,is_archived:0,notification_categories:{staff_communications_2:{phoneHash:phoneFingerprint(incoming.from),staffAssistantVersion:STAFF_SMS_COMMAND_VERSION,accessRequests:{staffSmsAssistant:true}}}}];
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('requestKey')?[prior]:sql.includes('INTERVAL 1 MINUTE')?[recent]:[[]])};
 d={db:{execute:vi.fn(async()=>[staff]),getConnection:vi.fn(async()=>db)},sender:vi.fn(async()=>({id:3,agency_id:2,registration})),suppressed:vi.fn(async()=>false),agency:vi.fn(async()=>({id:2,name:'ITSCO',slug:'itsco'})),command:vi.fn(async()=>({reply:'Task added.',taskId:99})),send:vi.fn(),encrypt:vi.fn(s=>({cipher:s})),evidence:vi.fn(async()=> '11111111-1111-4111-8111-111111111111'),capability:vi.fn(v=>v)};
});
it('does not consume votes, STOP, HELP or clinical-number messages',async()=>{
 for(const body of ['Y','1','SUPPORT','STOP','HELP']){expect(parseStaffSmsRequest(body)).toBeNull();expect(await handleStaffSmsAssistant({...incoming,body},d)).toBe(false);}
 expect(await handleStaffSmsAssistant({...incoming,to:'+17195550199'},d)).toBe(false);expect(d.send).not.toHaveBeenCalled();
});
it('executes an opted-in command in the evidence transaction before replying',async()=>{
 expect(await handleStaffSmsAssistant(incoming,d)).toBe(true);
 expect(d.command).toHaveBeenCalledWith(expect.objectContaining({request:{kind:'task_create',title:'Update the Kudos page and incorporate a menu'},db}));
 expect(db.beginTransaction).toHaveBeenCalled();expect(db.commit).toHaveBeenCalled();expect(db.rollback).not.toHaveBeenCalled();
 expect(d.evidence.mock.calls[0][0].details).toMatchObject({taskId:99,kind:'task_create',enabled:true});
 expect(d.evidence.mock.invocationCallOrder[0]).toBeLessThan(db.commit.mock.invocationCallOrder[0]);
 expect(db.commit.mock.invocationCallOrder[0]).toBeLessThan(d.send.mock.invocationCallOrder[0]);
 expect(d.send.mock.calls[0][0].body).toContain('Task added');
 expect(d.encrypt).not.toHaveBeenCalled();
});
it('requires fresh command consent and the saved mobile number; still returns MENU instructions',async()=>{
 const state=staff[0].notification_categories.staff_communications_2;
 for(const patch of [{staffAssistantVersion:null},{accessRequests:{staffSmsAssistant:false}},{phoneHash:'other'}]){
  const saved={...state};Object.assign(state,patch);await handleStaffSmsAssistant(incoming,d);expect(d.command).not.toHaveBeenCalled();expect(d.send.mock.calls.at(-1)[0].body).toContain('Enable or review');Object.assign(state,saved);
 }
});
it('rolls back tasks when evidence fails and does not reply with false success',async()=>{
 d.evidence.mockRejectedValueOnce(new Error('storage failure'));
 await expect(handleStaffSmsAssistant(incoming,d)).rejects.toThrow('storage failure');
 expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();expect(d.send).not.toHaveBeenCalled();
});
it('does not execute a command again when a committed webhook is replayed',async()=>{
 await handleStaffSmsAssistant(incoming,d);prior=[{event_id:'committed'}];
 await handleStaffSmsAssistant(incoming,d);expect(d.command).toHaveBeenCalledTimes(1);expect(d.send).toHaveBeenCalledTimes(1);
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
