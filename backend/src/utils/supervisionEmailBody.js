import { escapeMeetingHtml as esc } from '../services/meetingInvitationPolicy.js';

export function supervisionEmailBody({session,recipientName,hostNames,people,calendar,joinUrl,rsvpUrl,presentationUrl,detailsUrl,isRequired,isPresenter,isHost,kind='invitation',meetingTitle=null,hostLabel=null}) {
 const group=String(session.session_type).toLowerCase()==='group';
 const title=meetingTitle||(group?'Group supervision':'Individual supervision');
 const signup=session.enrollment_mode==='signup_only';
 const accepted=people.filter(p=>['SIGNED_UP','JOINED','LEFT'].includes(p.status)&&p.participant_role==='supervisee');
 const presenters=people.filter(p=>p.isPresenter).map(p=>p.name);
 const status=isHost?'You’re hosting this session':isPresenter?'You’re presenting':signup?'Please RSVP to confirm your place':isRequired?'Your attendance is required':group?'Optional session':meetingTitle?'Your meeting appointment':'Your supervision appointment';
 const intro=meetingTitle?`A time to connect with your ${hostLabel.toLowerCase()}, ask questions, and work toward your goals.`:isPresenter?'Thank you for presenting your case conceptualization. Review your presentation and update it before we meet.':group?'Join us for case discussion, shared perspectives, and supportive professional growth.':'A dedicated time to connect with your supervisor, ask questions, and continue your professional growth.';
 const inPerson=['IN_PERSON','IN-PERSON'].includes(String(session.modality).toUpperCase());
 const button=(label,url,primary=false)=>`<a href="${esc(url)}" style="display:block;margin:10px 0;padding:15px 20px;border:1px solid #34734f;border-radius:10px;text-decoration:none;text-align:center;font-weight:bold;font-size:17px;line-height:1.4;background:${primary?'#34734f':'#ffffff'};color:${primary?'#ffffff':'#24563b'};">${esc(label)}</a>`;
 const row=(label,value)=>`<tr><td style="padding:10px 20px;"><div style="font-size:13px;color:#53655e;">${esc(label)}</div><div style="font-size:18px;font-weight:bold;color:#183d31;">${esc(value)}</div></td></tr>`;
 const html=`<div style="font:16px/1.6 Arial,Helvetica,sans-serif;color:#33443d;">
 <p style="margin:0 0 14px;">Hi ${esc(recipientName)},</p><p style="font-size:12px;letter-spacing:2px;font-weight:bold;color:#34734f;">${kind==='invitation'?'YOU’RE INVITED':'YOUR UPCOMING SESSION'}</p>
 <h1 style="font-size:32px;line-height:1.2;color:#103e2f;margin:0 0 15px;">${title}</h1>
 <p style="font-size:20px;font-weight:bold;color:#34734f;">${status}</p><p>${intro}</p>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f6f2" style="border-radius:14px;background:#f1f6f2;margin:20px 0;">
 ${row('Date',calendar.dateLabel)}${row('Time',calendar.timeLabel)}${row('Time zone',session.event_timezone||'America/Denver')}${row('Format',inPerson?session.location_text||'In person':meetingTitle?'Virtual meeting':'Virtual supervision')}${row(hostLabel||(group?'Host':'Supervisor'),hostNames.join(', '))}${presenters.length?row('Case conceptualization presenter',presenters.join(', ')):''}</table>
 ${session.recurrence_series_id?'<p style="color:#53655e;">This is part of a recurring meeting series. This reminder and your RSVP apply to the date shown above. See your schedule for all dates.</p>':''}
 ${button(inPerson?'View session details':meetingTitle?`Join ${meetingTitle}`:group?'Join Group Supervision':'Join Supervision',inPerson?detailsUrl:joinUrl,true)}
 ${isPresenter?button('Edit Your Presentation',presentationUrl):''}
 ${!isHost?button('RSVP · Attending or not attending',rsvpUrl):''}
 ${group?`<div style="padding:16px 20px;border-radius:12px;background:#f1f6f2;margin:20px 0;"><strong>${accepted.length} confirmed ${accepted.length===1?'attendee':'attendees'}</strong><p style="margin:5px 0;">${accepted.length?accepted.map(p=>esc(p.name)).join(', '):'Be the first to confirm.'}</p><small>As of this email.</small>${signup&&Number(session.auto_cancel_if_empty)?'<p style="margin:10px 0 0;">This session needs at least one participant to sign up before registration closes to take place.</p>':''}</div>`:''}
 <h2 style="font-size:18px;color:#183d31;">Add to your calendar</h2>${button('Google Calendar',calendar.googleUrl)}${button('Outlook Calendar',calendar.outlookUrl)}${button('Apple Calendar / iCal',calendar.downloadUrl)}
 <p style="font-size:13px;color:#63736b;">You can also open the attached ${meetingTitle?'huddle.ics':'supervision.ics'} file in your calendar app.</p>${button('View Meeting Details',detailsUrl)}
 <p style="border-top:1px solid #dce7df;padding-top:18px;margin-top:24px;">Need to reschedule or can’t attend? Reply to this email. Your message goes to ${esc(hostNames.join(' and ')||'your supervisor')} in the app. If your reply indicates you cannot attend, your RSVP is updated.</p>
 ${!isRequired&&group&&!isHost&&!isPresenter?'<p style="color:#63736b;">You’re welcome to attend if it fits your schedule. Please RSVP so we know who to expect.</p>':''}
 </div>`;
 const text=[`Hi ${recipientName},`,title,status,intro,`${calendar.dateLabel}, ${calendar.timeLabel} (${session.event_timezone||'America/Denver'})`,`Supervisor / hosts: ${hostNames.join(', ')}`,`Join: ${joinUrl}`,!isHost?`RSVP: ${rsvpUrl}`:'',isPresenter?`Edit presentation: ${presentationUrl}`:'',`Confirmed: ${accepted.map(p=>p.name).join(', ')||'None yet'}`,`Google Calendar: ${calendar.googleUrl}`,`Outlook: ${calendar.outlookUrl}`,`Apple Calendar / iCal: ${calendar.downloadUrl}`,`Details: ${detailsUrl}`,`Reply to this email to message your ${hostLabel || 'supervisor'} in the app.`].filter(Boolean).join('\n\n');
 return {subject:`${kind==='invitation'?'Invitation':'Reminder'}: ${title} with ${hostNames.join(' and ')}`,html,text};
}
