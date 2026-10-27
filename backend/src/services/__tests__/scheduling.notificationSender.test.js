import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ mailboxes: vi.fn(), trigger: vi.fn(), identity: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../providerWaitlistEmail.service.js', () => ({ resolveWaitlistMailboxes: m.mailboxes }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: m.trigger, sendEmailFromIdentity: m.identity }));
vi.mock('../clientPortalEmail.service.js', () => ({ clientEmailContext: vi.fn(async () => ({ brand: {replyTo:'portal@example.test',products:[],name:'Test organization',clinical:true},tenant:{name:'Test organization'} })), sendClientPortalEmail: vi.fn() }));
vi.mock('../appointmentServiceSetting.service.js', () => ({ resolveAppointmentServiceSetting: vi.fn(async()=>({isSchool:false})) }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ ensureTenantNotificationsMailbox: async () => ({ notifications: { id: 17 }, domain: 'example.test' }) }));
import { sendReplacementProviderEmail } from '../replacementOfferEvents.service.js';
import { sendScheduleNotificationEmail } from '../scheduleNotificationEmail.service.js';
it('always selects the tenant notifications From and support Reply-To', async () => {
  m.mailboxes.mockResolvedValue({ senderIdentityId: 7, from: 'notifications@itsco.health', support: 'support@itsco.health' });
  await sendScheduleNotificationEmail({ agencyId: 2, senderIdentityId: 99, replyToOverride: 'other@example.test', subject: 'Cancellation' });
  expect(m.trigger).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, senderIdentityId: 7, replyToOverride: 'support@itsco.health' }));
  await sendScheduleNotificationEmail({ agencyId: 2, existingCommunicationId: 88 });
  expect(m.identity).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 7, replyToOverride: 'support@itsco.health', existingCommunicationId: 88 }));
});
it('does not fall back to an unrelated sender when tenant mailboxes are missing', async () => {
  vi.clearAllMocks(); m.mailboxes.mockRejectedValue(new Error('Configure tenant mailboxes'));
  await expect(sendScheduleNotificationEmail({ agencyId: 2 })).rejects.toThrow('Configure tenant');
  expect(m.trigger).not.toHaveBeenCalled(); expect(m.identity).not.toHaveBeenCalled();
});

it('uses the agency notifications identity and noreply Reply-To for a selected replacement', async () => {
  await sendReplacementProviderEmail({ agency_id:2, provider_id:5, request_id:77, linked_appointment_id:88 }, { outcome_text:'Client selected a time.' }, {execute:async()=>[[{email:'provider@example.test'}]]});
  expect(m.identity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:17,to:'provider@example.test',replyToOverride:'noreply@example.test',templateType:'replacement_time_selected',text:expect.stringContaining('Appointment #88 is scheduled; no approval is needed')}));
});

it('uses notifications and support for reviewed day-cancellation family messages, including clinical portals',async()=>{
 m.mailboxes.mockResolvedValue({senderIdentityId:7,from:'notifications@itsco.health',support:'support@itsco.health'});
 await sendScheduleNotificationEmail({agencyId:2,clientId:8,to:'parent@example.test',text:'Weather conditions',entries:[{appointment:{id:1},payload:{facts:{reasonCategory:'weather'}}}]});
 expect(m.identity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:7,replyToOverride:'support@itsco.health',portalEmailBrand:expect.objectContaining({displayName:'Test organization Notifications'})}));
});
