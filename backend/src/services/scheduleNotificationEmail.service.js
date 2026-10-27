import pool from '../config/database.js';
import { renderPortalEmail } from './portalEmailBranding.service.js';
import { resolveWaitlistMailboxes } from './providerWaitlistEmail.service.js';
import { sendNotificationEmail, sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { clientEmailContext, sendClientPortalEmail } from './clientPortalEmail.service.js';
import { resolveAppointmentServiceSetting } from './appointmentServiceSetting.service.js';
import { buildScheduleNoticeMessage } from './scheduleNoticeMessage.service.js';
import { createSchoolSessionEmailOptOutLink, isSchoolSessionEmailOptedOut, schoolSessionEmailOptOutContent, SCHOOL_EMAIL_TEMPLATE } from './schoolSessionEmailPreferences.service.js';

/** Require the tenant's configured notifications sender and staffed support reply mailbox. */
export async function sendScheduleNotificationEmail({ agencyId, appointment = null, entries = null, ...message }) {
  if(message.clientId) {
    const context=await clientEmailContext({agencyId,clientId:message.clientId});
    const scope={agencyId,clientId:message.clientId,to:message.to};
    const items=entries || (appointment ? [{appointment}] : []);
    const settings=await Promise.all(items.map(item=>resolveAppointmentServiceSetting(item.appointment)));
    const hasSchool=settings.some(setting=>setting.isSchool);
    if(hasSchool) {
      const disabled=await isSchoolSessionEmailOptedOut(scope);
      const remaining=items.filter((_,i)=>!disabled || !settings[i].isSchool);
      if(!remaining.length) return {skipped:true,reason:'school_session_email_opted_out'};
      if(entries && remaining.length!==items.length) Object.assign(message,buildScheduleNoticeMessage(remaining,context.url(`guardian?panel=appointments&clientId=${message.clientId}`)));
      if(!disabled) {
        const link=await createSchoolSessionEmailOptOutLink(scope),footer=schoolSessionEmailOptOutContent(link.url);
        message.text=(message.text||'')+footer.text;message.html=(message.html||'')+footer.html;
        if(settings.every(setting=>setting.isSchool)) {
          message.templateType=SCHOOL_EMAIL_TEMPLATE;message.schoolSessionScopeKey=link.scopeKey;
          if(message.existingCommunicationId) await pool.execute("UPDATE user_communications SET template_type=?,metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.schoolSessionScopeKey',?) WHERE id=?",[SCHOOL_EMAIL_TEMPLATE,link.scopeKey,message.existingCommunicationId]);
        }
      }
    }
    if (items.some(item => item.payload?.facts?.reasonCategory)) {
      const mailboxes = await resolveWaitlistMailboxes(pool, agencyId);
      const brand = { ...context.brand, replyTo: mailboxes.support, displayName: `${context.tenant.name} Notifications` };
      return sendEmailFromIdentity({ ...message, agencyId, senderIdentityId: mailboxes.senderIdentityId,
        replyToOverride: mailboxes.support, fromDisplayNameOverride: brand.displayName, portalEmailBrand: brand,
        html: renderPortalEmail({ brand, ...message }) });
    }
    return sendClientPortalEmail({...message,agencyId,context});
  }
  const mailboxes = await resolveWaitlistMailboxes(pool, agencyId);
  const send = message.existingCommunicationId ? sendEmailFromIdentity : sendNotificationEmail;
  return send({ ...message, agencyId, senderIdentityId: mailboxes.senderIdentityId,
    replyToOverride: mailboxes.support });
}
