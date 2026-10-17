import { expect, it, vi } from 'vitest';
vi.mock('../gmailSendAs.service.js',()=>({ensureSendAsAlias:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({inferAgencyMailDomain:vi.fn()}));
import { clinicalReminderBrand, renderClinicalReminder } from '../clinicalReminderEmail.service.js';
it('requires clinical chart access and does not brand tutoring as EHR reminders',()=>{
 expect(()=>clinicalReminderBrand({agency:{name:'Tutoring',feature_flags:{}},domain:'example.test'})).toThrow('clinical chart');
 const brand=clinicalReminderBrand({agency:{name:'ITSCO',slug:'itsco',feature_flags:{medicalBillingEnabled:true}},domain:'itsco.health'});
 expect(brand.fromEmail).toBe('reminders@auricwell.com');
 expect(brand.displayName).toBe('AuricWell Reminders');
 const html=renderClinicalReminder({brand,firstName:'Michael',date:'Monday, October 26',time:'2 PM',setting:'Virtual',confirmUrl:'https://example.test/confirm',cancelUrl:'https://example.test/cancel',rescheduleUrl:'https://example.test/change',preview:true});
 expect(html).toContain('Yes, I’m attending');expect(html).toContain('I can’t attend');expect(html).toContain('Request a new time');
 expect(html).toContain('do not change a real appointment');
 expect(html.match(/data-portal-email=/g)).toHaveLength(1);
 expect(()=>renderClinicalReminder({brand,confirmUrl:'javascript:bad'})).toThrow('secure URLs');
});
