import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/MessageLog.model.js',()=>({default:{normalizePhone:v=>v}}));
vi.mock('../../models/SmsThreadEscalation.model.js',()=>({default:{createOrKeep:vi.fn()}}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn()}}));
import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import Vonage from '../vonage.service.js';
import Escalation from '../../models/SmsThreadEscalation.model.js';
import Service from '../smsSupportEscalation.service.js';
it('escalates with a generic app link under the message-alert choice, never clinical content',async()=>{
 pool.execute.mockResolvedValue([[{id:1,agency_id:2,user_id:7,client_id:88,client_initials:'AB',body:'Sensitive clinical message',created_at:new Date(Date.now()-86400000),to_number:'+13035550100',agency_phone:'+13035550101',feature_flags:{}}]]);
 Agency.findById.mockResolvedValue({id:2,slug:'itsco'});
 await Service.runTick();
 expect(Vonage.sendSms).toHaveBeenCalledWith({purpose:'workforce',agencyId:2,staffNotificationKind:'messageAlerts',to:'+13035550101',from:'+13035550100',body:'You have a message waiting in the app. Sign in to review: https://app.itsco.health'});
 expect(Escalation.createOrKeep).toHaveBeenCalledWith(expect.objectContaining({clientId:88,threadMode:'read_only'}));
});
