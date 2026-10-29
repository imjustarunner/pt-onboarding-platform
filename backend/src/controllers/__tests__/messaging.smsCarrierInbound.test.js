import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../services/staffSmsAssistant.service.js',()=>({handleStaffSmsAssistant:vi.fn()}));
vi.mock('../../services/smsCommunicationNotice.service.js',()=>({sendConversationStartNotice:vi.fn()}));
vi.mock('../../services/smsOutOfOffice.service.js',()=>({offerOutOfOfficeSupport:vi.fn(),handleOutOfOfficeSupportReply:vi.fn()}));
vi.mock('../../services/communicationReview.service.js',()=>({inspectInboundReception:vi.fn(),enqueueCommunicationReview:vi.fn()}));
vi.mock('../../services/companyEventSmsReply.service.js',()=>({deliverCompanyEventVoteReply:vi.fn()}));
vi.mock('../../services/companyEventCheckinSms.service.js',()=>({handleCompanyEventCheckinInbound:vi.fn()}));
vi.mock('../../services/companyEventSms.service.js',()=>({handleCompanyEventTopicInbound:vi.fn(),recordCompanyEventSmsDeliveryStatus:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../../models/Client.model.js',()=>({default:{}}));
vi.mock('../../models/UserPreferences.model.js',()=>({default:{}}));
vi.mock('../../models/UserCallSettings.model.js',()=>({default:{}}));
vi.mock('../../services/notificationDispatcher.service.js',()=>({createNotificationAndDispatch:vi.fn()}));
vi.mock('../../models/MessageLog.model.js',()=>({default:{}}));
vi.mock('../../models/MessageAutoReplyThrottle.model.js',()=>({default:{}}));
vi.mock('../../services/notificationGatekeeper.service.js',()=>({default:{}}));
vi.mock('../../services/vonage.service.js',()=>({default:{}}));
vi.mock('../../models/PhoneNumberRule.model.js',()=>({default:{}}));
vi.mock('../../models/SmsOptInState.model.js',()=>({default:{}}));
vi.mock('../../services/smsCompliance.service.js',()=>({getSmsSender:vi.fn(),resolveRegisteredSmsSender:vi.fn(),processSmsKeyword:vi.fn(),recordInboundConversation:vi.fn()}));
vi.mock('../../models/SmsThreadEscalation.model.js',()=>({default:{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../../services/communicationRouting.service.js',()=>({resolveInboundRoute:vi.fn()}));
vi.mock('../agencyCampaigns.controller.js',()=>({handleAgencyCampaignInbound:vi.fn()}));
vi.mock('../companyEvents.controller.js',()=>({handleCompanyEventInbound:vi.fn()}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:vi.fn()}));
vi.mock('../../models/AgencyContact.model.js',()=>({default:{}}));
vi.mock('../../models/ContactCommunicationLog.model.js',()=>({default:{}}));
vi.mock('../../services/smsAutoReplyRule.service.js',()=>({default:{}}));
vi.mock('../../services/vacationScheduleSync.service.js',()=>({default:{}}));
vi.mock('../../services/appointmentReply.service.js',()=>({handleInboundSmsAppointmentReply:vi.fn()}));
vi.mock('../../services/smsProfileAudit.service.js',()=>({recordSmsProfileAudit:vi.fn()}));
import { inboundSmsWebhook } from '../vonageWebhook.controller.js';
import { getSmsSender, processSmsKeyword, recordInboundConversation } from '../../services/smsCompliance.service.js';
import { inspectInboundReception, enqueueCommunicationReview } from '../../services/communicationReview.service.js';
import { resolveInboundRoute } from '../../services/communicationRouting.service.js';
import { handleInboundSmsAppointmentReply } from '../../services/appointmentReply.service.js';
import { handleStaffSmsAssistant } from '../../services/staffSmsAssistant.service.js';
import { handleCompanyEventCheckinInbound } from '../../services/companyEventCheckinSms.service.js';
import { deliverCompanyEventVoteReply } from '../../services/companyEventSmsReply.service.js';
import VonageService from '../../services/vonage.service.js';
const request=(carrier,text='Y')=>({smsProvider:carrier,body:{from:'17195550101',to:'17195550100',text,messageId:'test-id'},query:{}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
beforeEach(()=>{
 vi.resetAllMocks();
 VonageService.sendSms=vi.fn();
 getSmsSender.mockResolvedValue({agency_id:450,registration:{provider:'vonage',purposes:['workforce']}});
 inspectInboundReception.mockResolvedValue({number:{id:2,agency_id:450},profile:{clientId:10,clients:[{id:10}]},reason:null});
 resolveInboundRoute.mockResolvedValue({agencyId:450,clientId:10,skipClinicalInbox:true});
 handleInboundSmsAppointmentReply.mockResolvedValue({ackMessage:'Confirmed'});
});
it('preserves a client reply on Vonage for support without changing the appointment or forwarding it',async()=>{
 const res=response(),next=vi.fn();await inboundSmsWebhook(request('vonage','N'),res,next);
 expect(enqueueCommunicationReview).toHaveBeenCalledWith(expect.objectContaining({agencyId:450,numberId:2,reason:'client_sms_requires_notifyre',body:'N'}));
 expect(handleInboundSmsAppointmentReply).not.toHaveBeenCalled();expect(recordInboundConversation).not.toHaveBeenCalled();expect(VonageService.sendSms).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();
});
it('routes a Notifyre patient reply to appointment handling without invoking staff or polling handlers',async()=>{
 getSmsSender.mockResolvedValue({agency_id:450,registration:{provider:'notifyre'}});
 const next=vi.fn();await inboundSmsWebhook(request('notifyre'),response(),next);
 expect(handleInboundSmsAppointmentReply).toHaveBeenCalledWith(expect.objectContaining({agencyId:450,clientId:10,rawBody:'Y'}));
 expect(handleStaffSmsAssistant).not.toHaveBeenCalled();expect(handleCompanyEventCheckinInbound).not.toHaveBeenCalled();expect(VonageService.sendSms).toHaveBeenCalledWith(expect.objectContaining({purpose:'care',body:'Confirmed'}));expect(next).not.toHaveBeenCalled();
});
it('preserves existing Vonage staff assistant requests',async()=>{
 handleStaffSmsAssistant.mockResolvedValue(true);await inboundSmsWebhook(request('vonage','Help with my schedule'),response(),vi.fn());
 expect(handleStaffSmsAssistant).toHaveBeenCalledOnce();expect(enqueueCommunicationReview).not.toHaveBeenCalled();expect(handleInboundSmsAppointmentReply).not.toHaveBeenCalled();
});
it('preserves existing staff polling replies and acknowledgments',async()=>{
 handleCompanyEventCheckinInbound.mockResolvedValue({handled:true,agencyId:450,responseMessage:'Recorded'});
 await inboundSmsWebhook(request('vonage'),response(),vi.fn());expect(deliverCompanyEventVoteReply).toHaveBeenCalledOnce();expect(handleInboundSmsAppointmentReply).not.toHaveBeenCalled();expect(enqueueCommunicationReview).not.toHaveBeenCalled();
});
it.each(['vonage','notifyre'])('processes STOP first on %s',async carrier=>{
 getSmsSender.mockResolvedValue({registration:{provider:carrier}});processSmsKeyword.mockResolvedValue(true);
 await inboundSmsWebhook(request(carrier,'STOP'),response(),vi.fn());expect(processSmsKeyword).toHaveBeenCalledOnce();expect(inspectInboundReception).not.toHaveBeenCalled();expect(handleInboundSmsAppointmentReply).not.toHaveBeenCalled();
});
it('rejects the wrong carrier webhook for a registered number before processing consent or messages',async()=>{
 getSmsSender.mockResolvedValue({registration:{provider:'notifyre'}});const res=response();await inboundSmsWebhook(request('vonage'),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);expect(processSmsKeyword).not.toHaveBeenCalled();expect(inspectInboundReception).not.toHaveBeenCalled();
});
