const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = value => /^https?:\/\//i.test(String(value || '')) ? String(value) : '';
export function companyEventWhen(event) {
  const raw = event.startsAt || event.starts_at;
  const start = raw ? new Date(raw) : null;
  if (!start || !Number.isFinite(start.getTime())) return 'Date to be decided';
  const timezone = event.timezone || 'America/Denver';
  const day = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(start);
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const endRaw = event.endsAt || event.ends_at, end = endRaw ? new Date(endRaw) : null;
  return `${day} · ${clock.format(start)}${end && Number.isFinite(end.getTime()) ? `–${clock.format(end)}` : ''}`;
}

/** Email uses restrained editorial styling, independent of the app's button colors. */
export function companyEventInvitationEmail({ event, user = {}, agencies = [], rsvpUrl, detailsUrl, kind = 'invitation', mandatory = false, voting = null }) {
  const title = event.title || 'Company event', when = companyEventWhen(event);
  const hosts = agencies.map(a => a.name).filter(Boolean).join(' + ') || 'Your organization';
  const first = user.first_name || user.firstName || 'there';
  const location = event.eventLocationName || event.event_location_name || '';
  const address = event.eventLocationAddress || event.event_location_address || '';
  const description = event.description || '';
  const heading = voting ? 'Help shape the event' : kind === 'attendance_reminder' ? 'See you soon' : kind === 'rsvp_reminder' ? 'A place for you' : 'You’re invited';
  const prompt = voting ? 'Help the organizers choose the details. Your vote is separate from your event RSVP.' : kind === 'attendance_reminder' ? 'Your event is coming up. Here are the details to help you plan.' : 'Please let us know whether you can join us.';
  const subject = `${voting ? (voting.followup ? 'Reminder — event vote' : 'Event vote') : kind === 'invitation' ? 'You’re invited' : kind === 'rsvp_reminder' ? 'Please RSVP' : 'Coming up'}: ${title}`;
  const rsvp = safeUrl(rsvpUrl), details = safeUrl(detailsUrl) || rsvp;
  const text = [`Hi ${first},`, `${hosts} ${kind === 'attendance_reminder' ? 'looks forward to seeing you at' : 'invites you to'} ${title}.`, when,
    [location, address].filter(Boolean).join(' · '), description, mandatory ? 'Your attendance is required.' : 'Attendance is optional.', prompt,
    voting ? `${voting.question}\n${voting.options.map(option => `• ${option.label}`).join('\n')}\nVote: ${safeUrl(voting.url)}` : `RSVP Yes, No or Maybe: ${rsvp}`, `Event details: ${details}`].filter(Boolean).join('\n\n');
  const brandCards = agencies.map(a => {
    const logo = safeUrl(a.logoUrl || a.logo_url);
    return `<td style="padding:4px 12px 4px 0;vertical-align:middle">${logo ? `<img src="${esc(logo)}" alt="${esc(a.name)}" style="max-width:140px;max-height:44px;display:block;border:0">` : `<span style="font:600 13px Arial,sans-serif;color:#284f4d">${esc(a.name)}</span>`}</td>`;
  }).join('');
  const responseLinks = ['yes', 'no', 'maybe'].map((value, index) => `<td style="padding:0 8px 8px 0"><a href="${esc(`${rsvp}${rsvp.includes('?') ? '&' : '?'}r=${value}`)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${index === 0 ? '#254b48' : '#f4f3ee'};border:1px solid ${index === 0 ? '#254b48' : '#d9ded8'};color:${index === 0 ? '#ffffff' : '#254b48'};text-decoration:none;font:600 14px Arial,sans-serif">${['Yes, I’ll be there', 'Can’t make it', 'Maybe'][index]}</a></td>`).join('');
  const decisionPanel = voting ? `<h2 style="font:400 23px Georgia,serif;margin:24px 0 14px">${esc(voting.question)}</h2><ul style="font-size:14px;line-height:1.9;padding-left:20px">${voting.options.map(option => `<li>${esc(option.label)}</li>`).join('')}</ul>${voting.closesAt ? `<p style="font-size:12px;line-height:1.6;color:#61776d">Voting closes ${esc(companyEventWhen({startsAt:voting.closesAt,timezone:event.timezone}))}</p>` : ''}<p style="margin:22px 0"><a href="${esc(safeUrl(voting.url))}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#254b48;color:#fff;text-decoration:none;font:600 14px Arial,sans-serif">Vote in this event →</a></p><p style="font-size:12px;line-height:1.6;color:#61776d">Sign in with your work account to choose an answer. Opening this email does not cast a vote.</p>` : kind !== 'attendance_reminder' ? `<p style="font:400 23px Georgia,serif;margin:24px 0 14px">Will you join us?</p><table role="presentation"><tr>${responseLinks}</tr></table>` : '';
  const footer = voting ? 'Sign in to vote using your own account. Your event RSVP stays separate.' : 'Your invitation is personal; use your private RSVP link to update your response.';
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f1f3ef;color:#233d3a;font-family:Arial,sans-serif"><table role="presentation" style="max-width:640px;width:100%;margin:auto;border-collapse:collapse"><tr><td style="padding:12px 8px 22px"><table role="presentation"><tr>${brandCards}</tr></table></td></tr><tr><td style="background:#fff;border:1px solid #dfe5dc;border-radius:18px;overflow:hidden"><div style="padding:40px 36px 32px;background:#e9eee6;border-bottom:1px solid #dfe5dc"><p style="margin:0 0 14px;text-transform:uppercase;letter-spacing:2px;font-size:11px;color:#5d756d">${esc(heading)} · ${mandatory ? 'Required attendance' : 'Optional attendance'}</p><h1 style="margin:0;font:400 36px Georgia,serif;line-height:1.2;color:#233d3a">${esc(title)}</h1><p style="margin:18px 0 0;font-size:14px;line-height:1.7">${esc(hosts)}</p></div><div style="padding:30px 36px 36px"><p style="margin:0 0 18px;font-size:16px;line-height:1.6">Hi ${esc(first)}, ${esc(prompt)}</p><table role="presentation" style="width:100%;font-size:14px;line-height:1.7"><tr><td style="padding:14px 0;border-bottom:1px solid #edf0eb"><strong>When</strong><br>${esc(when)}</td></tr>${location || address ? `<tr><td style="padding:14px 0;border-bottom:1px solid #edf0eb"><strong>Where</strong><br>${esc(location)}${address ? `<br>${esc(address)}` : ''}</td></tr>` : ''}</table>${description ? `<p style="font-size:14px;line-height:1.8;margin:22px 0;white-space:pre-line">${esc(description)}</p>` : ''}${decisionPanel}<p style="margin:22px 0 0;font-size:14px"><a href="${esc(details)}" style="color:#254b48;text-underline-offset:4px">View event details${event.potluckEnabled || event.potluck_enabled ? ' & potluck' : ''} →</a></p></div></td></tr><tr><td style="padding:22px 8px;font-size:11px;line-height:1.7;color:#6c7c72">Sent by ${esc(hosts)}. ${esc(footer)}</td></tr></table></body></html>`;
  return { subject, text, html };
}

export function companyEventVoteEmail({parentEvent,poll,user,agencies,voteUrl,detailsUrl,followup=false,mandatory=false}) {
  const voting = poll.votingConfig || {};
  return companyEventInvitationEmail({event:parentEvent,user,agencies,detailsUrl,mandatory,
    voting:{question:voting.question || poll.title,options:voting.options || [],closesAt:voting.closesAt || poll.endsAt,
      url:voteUrl,followup}});
}
