import { it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/UserCommunication.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../services/unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../../services/email.service.js',()=>({default:{sendEmail:vi.fn()}}));
import UserCommunication from '../../models/UserCommunication.model.js';
import {sendEmailFromIdentity} from '../../services/unifiedEmail/unifiedEmailSender.service.js';
import EmailService from '../../services/email.service.js';
import {retryCommunicationSend} from '../userCommunication.controller.js';
it('prevents a sibling history copy from sending the same family email again',async()=>{
 UserCommunication.findById.mockResolvedValue({id:8,agency_id:2,channel:'email',delivery_status:'failed',subject:'Enrollment received',body:'Your enrollment has been received.',recipient_address:'parent@example.test',template_type:'enrollment_submission_confirmation',metadata:{isSiblingMirror:true,primaryCommunicationId:7}});
 const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
 await retryCommunicationSend({user:{id:1,role:'super_admin'},params:{id:'8'}},res,next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(sendEmailFromIdentity).not.toHaveBeenCalled();expect(EmailService.sendEmail).not.toHaveBeenCalled();
});
