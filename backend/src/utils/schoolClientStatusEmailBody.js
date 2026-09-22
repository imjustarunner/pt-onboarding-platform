import { escapeMeetingHtml as esc } from '../services/meetingInvitationPolicy.js';

export function schoolClientStatusEmailBody({schoolName,clientLabel,providers,kind,reason,schoolUrl,providerUrl,readyForIntake=false}) {
  const waitlist = kind === 'waitlist';
  const names = providers.map(p=>[p.first_name,p.last_name].filter(Boolean).join(' ')).join(', ');
  const heading = waitlist ? 'Client waitlist update' : 'Client assigned to a provider';
  const summary = waitlist
    ? `${clientLabel} has been placed on the waitlist at ${schoolName}.`
    : `${clientLabel} has been assigned to ${names} at ${schoolName}.`;
  const next = waitlist
    ? 'Our Schools team will review availability and send an update when this client can move forward. No intake or service appointment should be arranged while the client remains waitlisted.'
    : readyForIntake
      ? 'The client is now available in the assigned provider’s portal, and their new-client workflow has been initiated. Please review the onboarding checklist, contact the parent or guardian to arrange intake, and coordinate the school schedule with the school team. Record your outreach and intake progress in the portal.'
      : 'The client is now available in the assigned provider’s portal, and their new-client workflow has been initiated. Please review the onboarding checklist and outstanding requirements. Once the client is cleared for intake, contact the parent or guardian and coordinate the school schedule with the school team.';
  const reasonText = String(reason || '').trim() || 'A specific reason has not yet been recorded. Please contact the Schools team for clarification.';
  const button=(label,url)=>`<a href="${esc(url)}" style="display:inline-block;margin:8px 8px 8px 0;padding:14px 20px;border-radius:8px;background:#21674b;color:#fff;text-decoration:none;font-weight:bold;">${esc(label)}</a>`;
  const html=`<div style="font:16px/1.6 Arial,Helvetica,sans-serif;color:#263c33;max-width:640px;">
    <p style="font-size:12px;letter-spacing:2px;color:#367552;font-weight:bold;">SCHOOL CLIENT UPDATE</p>
    <h1 style="color:#123f2d;font-size:28px;line-height:1.25;">${heading}</h1>
    <p>Hello school team${providers.length?' and provider team':''},</p><p>${esc(summary)}</p>
    <div style="padding:18px 22px;background:#f0f6f2;border-radius:12px;margin:20px 0;">
      <div><strong>School:</strong> ${esc(schoolName)}</div><div><strong>Client:</strong> ${esc(clientLabel)}</div>
      ${names?`<div><strong>Assigned provider${providers.length>1?'s':''}:</strong> ${esc(names)}</div>`:''}
      ${waitlist?`<div style="margin-top:10px;"><strong>Waitlist reason:</strong> ${esc(reasonText)}</div>`:''}
    </div><h2 style="font-size:19px;color:#123f2d;">${waitlist?'What happens next':'Next steps for the provider'}</h2>
    <p>${esc(next)}</p>${button('Open school portal',schoolUrl)}${providers.length?button('Open provider portal',providerUrl):''}
    <p style="border-top:1px solid #dce7df;padding-top:18px;">Questions or an update to share? Reply to this email so the Schools team can help.</p>
    <p>Thank you,<br><strong>Schools</strong></p></div>`;
  const text=[heading,'',summary,waitlist?`Waitlist reason: ${reasonText}`:'',next,`School portal: ${schoolUrl}`,providers.length?`Provider portal: ${providerUrl}`:'','Questions? Reply to the Schools team.','Thank you,','Schools'].filter(Boolean).join('\n\n');
  return {subject:`${schoolName} — ${waitlist?'Waitlist update':'Provider assignment'}: ${clientLabel}`,html,text};
}
