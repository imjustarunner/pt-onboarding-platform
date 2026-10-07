import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../communicationReview.service.js',()=>({enqueueCommunicationReview:vi.fn()}));
vi.mock('../../models/SmsCareThread.model.js',()=>({default:{setEscalated:vi.fn()}}));
import pool from '../../config/database.js';
import {enqueueCommunicationReview} from '../communicationReview.service.js';
import SmsCareThread from '../../models/SmsCareThread.model.js';
import Service from '../smsSupportEscalation.service.js';
beforeEach(()=>vi.resetAllMocks());
it('keeps ordinary overdue messages in app support review without texting clinical content',async()=>{
 pool.execute.mockResolvedValueOnce([[{id:1,agency_id:2,number_id:3,client_id:88,body:'Clinical message',from_number:'+17195550100',to_number:'+17195550200',is_read:0}]]).mockResolvedValueOnce([[]]);
 await Service.runTick();
 expect(SmsCareThread.setEscalated).toHaveBeenCalledWith(expect.objectContaining({clientId:88}));
 expect(enqueueCommunicationReview).toHaveBeenCalledWith(expect.objectContaining({channel:'sms_followup',messageLogId:1,reason:'unread_text'}));
});
it('excludes messages waiting for the providers and already accepted support replies from the overdue query',async()=>{
 pool.execute.mockResolvedValue([[]]);await Service.runTick();
 expect(pool.execute.mock.calls[0][0]).toContain("JSON_EXTRACT(ml.metadata, '$.awaitingProviderReturn')");
 expect(pool.execute.mock.calls[0][0]).toContain("JSON_EXTRACT(ml.metadata, '$.supportChoiceAccepted')");
 expect(enqueueCommunicationReview).not.toHaveBeenCalled();
});
