import { buildPublicAppUrl } from './publicPortalUrl.js';
import { emailActionButton } from './emailActionButton.js';

const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function schoolWeekdayCompletion(context) {
  const accounted = (context.days || []).filter(day => day.status === 'assigned' || day.answered === true).length;
  return { accounted, complete: context.eligible === true && context.days?.length === 5 && accounted === 5 };
}
export function schoolWeekdayProgress(context, tracking = {}) {
  const { accounted, complete } = schoolWeekdayCompletion(context);
  const openedAt = tracking.opened_at || context.openedAt || null;
  return { accounted, total: 5, status: complete ? 'completed' : openedAt ? 'opened' : 'pending', openedAt,
    completedAt: complete ? context.completedAt || tracking.completed_at || context.updatedAt || null : null,
    requestedAt: context.requestedAt || null,
    invitationStatus: tracking.invitation_status || 'not_sent', invitationSentAt: tracking.invitation_sent_at || null,
    smsStatus: complete && ['waiting','sending'].includes(tracking.sms_status) ? 'cancelled' : tracking.sms_status || 'not_scheduled', smsDueAt: complete ? null : tracking.sms_due_at || null,
    smsReason: tracking.sms_reason || null, thankyouStatus: tracking.thankyou_status || 'not_sent' };
}
export function schoolWeekdayUrl(agency) {
  return `${buildPublicAppUrl(agency, 'my-schedule')}?schoolAvailability=1&agencyId=${Number(agency.id)}`;
}
export function schoolWeekdayEmail({ person, agency, owner, kind = 'invitation' }) {
  const greeting = `Hi ${person.first_name || 'there'},`;
  if (kind === 'thankyou') {
    const message = 'Thank you for updating your school availability. All five weekdays are accounted for—you’re all set!';
    return { subject: 'Thank you—your school availability is complete', text: `${greeting}\n\n${message}`, html: `<p>${esc(greeting)}</p><p>${esc(message)}</p>` };
  }
  const url = schoolWeekdayUrl(agency);
  const intro = `Please finish your Monday–Friday school availability for ${agency.name}.`;
  const steps = ['Open the link and sign in with your work account. The School availability form opens from My Schedule.',
    'Keep assigned school days as shown. For each other weekday, choose Available or Not available.',
    'Check that all five days are accounted for, then select Save availability.'];
  const reply = `Questions? Reply to this email to reach ${owner.first_name || 'your school coordinator'}.`;
  return { subject: 'Please complete your school availability', linkUrl: url,
    text: `${greeting}\n\n${intro}\n\n${steps.map((step,index)=>`${index+1}. ${step}`).join('\n')}\n\nComplete your school availability: ${url}\n\n${reply}`,
    html: `<p>${esc(greeting)}</p><p>${esc(intro)}</p><ol>${steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>${emailActionButton('Complete school availability',url,true)}<p>${esc(reply)}</p>` };
}
export function schoolWeekdaySmsDue(row, now = new Date()) {
  const due = typeof row.sms_due_at==='string' && /^\d{4}-\d\d-\d\d /.test(row.sms_due_at) ? new Date(row.sms_due_at.replace(' ','T')+'Z') : new Date(row.sms_due_at);
  if (row.completed_at || row.cancelled_at || row.invitation_status !== 'sent' || row.sms_status !== 'waiting' || !row.sms_due_at || !Number.isFinite(due.getTime()) || due > now) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/Denver',weekday:'short',hour:'numeric',hourCycle:'h23' }).formatToParts(now).map(p=>[p.type,p.value]));
  return !['Sat','Sun'].includes(parts.weekday) && Number(parts.hour) >= 9 && Number(parts.hour) < 17;
}
