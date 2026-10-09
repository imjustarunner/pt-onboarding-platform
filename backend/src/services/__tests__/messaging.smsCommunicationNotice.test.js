import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>({name:'ITSCO',portal_url:'itsco'}))}}));
vi.mock('../../models/MessageLog.model.js',()=>({default:{createOutbound:vi.fn(async()=>({id:9})),markSent:vi.fn(),markFailed:vi.fn()}}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn(async()=>({sid:'sent'}))}}));
import pool from '../../config/database.js';
import MessageLog from '../../models/MessageLog.model.js';
import Vonage from '../vonage.service.js';
import {sendConversationStartNotice} from '../smsCommunicationNotice.service.js';
let db,recent;
const input={agencyId:2,numberId:1,clientId:4,userId:7,from:'+17195550100',to:'+17195550101',inboundLogId:6};
beforeEach(()=>{vi.clearAllMocks();recent=[];db={execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT id')?[recent]:[[]]),release:vi.fn()};pool.getConnection.mockResolvedValue(db);});
it('sends the rules without client information through the standard care gate',async()=>{
 expect(await sendConversationStartNotice(input)).toBe(true);
 const request=Vonage.sendSms.mock.calls[0][0];expect(request).toMatchObject({purpose:'care',agencyId:2});
 expect(request.body).toContain('https://app.itsco.health/community-standards');expect(request.body).toContain('988');expect(request.body).toContain('STOP');
 expect(MessageLog.markSent).toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
});
it('does not repeat during a conversation or webhook retry and does not reply to unknown clients',async()=>{
 recent=[{id:8}];expect(await sendConversationStartNotice(input)).toBe(false);expect(Vonage.sendSms).not.toHaveBeenCalled();
 pool.getConnection.mockClear();await sendConversationStartNotice({...input,clientId:null});expect(pool.getConnection).not.toHaveBeenCalled();
});
it('preserves opt-out/failed delivery and releases the serialization lock',async()=>{
 Vonage.sendSms.mockRejectedValueOnce(Object.assign(new Error('suppressed'),{code:'sms_opted_out'}));
 expect(await sendConversationStartNotice(input)).toBe(false);expect(MessageLog.markFailed).toHaveBeenCalledWith(9,'sms_opted_out');
 expect(db.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)',expect.any(Array));expect(db.release).toHaveBeenCalled();
});
