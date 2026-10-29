import { createHash } from 'node:crypto';
import { replacementOpeningWindow, replacementWallTime } from './replacementOpeningWindow.js';
import { isValidTimeZone } from '../utils/zonedWallTime.util.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export const reservationError = (message, status = 400) => Object.assign(new Error(message), { status });
export const reservationHash = value => createHash('sha256').update(String(value)).digest('hex');
export const reservationSql = value => parseUtcDate(value).toISOString().slice(0,19).replace('T',' ');
export const reservationIso = value => parseUtcDate(value)?.toISOString() || null;
export const reservationConfig = value => typeof value === 'string' ? JSON.parse(value) : value;
export const reservationStaffRoles = Object.freeze(['super_admin','admin','assistant_admin','support','staff','provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','facilitator','clinician','qbha']);
export const reservationStaff = user => !!user?.id && reservationStaffRoles.includes(String(user.role || '').toLowerCase());
const text = (value, max) => String(value || '').trim().slice(0,max);
export function reservationEmail(value) {
  const email=text(value,255).toLowerCase();
  if (!email || email.length>254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)) throw reservationError('Enter one valid email address for each recipient.');
  return email;
}
export function reservationWindows(input, now = new Date()) {
  if (!isValidTimeZone(input.timeZone)) throw reservationError('Choose a valid time zone.');
  if (!Array.isArray(input.windows) || !input.windows.length || input.windows.length>14) throw reservationError('Choose one to fourteen time windows.');
  const slots=input.windows.flatMap(window => {
    const generated=replacementOpeningWindow(window,input.timeZone,now);
    return generated.slots.map(s=>({...s,holdEndAt:new Date(Math.min(+generated.end,+new Date(s.endAt)+Number(window.gapMinutes || 0)*60000)).toISOString()}));
  }).sort((a,b)=>a.startAt.localeCompare(b.startAt));
  if (slots.length>96) throw reservationError('Offer up to 96 times in one invitation.');
  for(let i=1;i<slots.length;i++) if(slots[i].startAt<slots[i-1].holdEndAt) throw reservationError('Time windows and their gaps must not overlap.');
  return slots;
}
export function normalizeReservation(input, roster, now = new Date()) {
  const title=text(input.title,180), type=input.type || 'general';
  if(!title || /[\r\n]/.test(title)) throw reservationError('Enter a meeting title on one line.');
  if(!['general','evaluation'].includes(type)) throw reservationError('Choose a meeting or employee evaluation.');
  const modality=input.modality;
  if(!['VIRTUAL','IN_PERSON','BOTH'].includes(modality)) throw reservationError('Choose in person, virtual, or both.');
  const location=text(input.location,500), meetingUrl=text(input.meetingUrl,1024);
  if(modality!=='VIRTUAL' && !location) throw reservationError('Enter the confirmed in-person location.');
  if(modality!=='IN_PERSON') {
    let url;try{url=new URL(meetingUrl);}catch{}
    if(!url || url.protocol!=='https:' || url.username || url.password) throw reservationError('Enter the HTTPS video meeting link invitees should use.');
  }
  const generated=reservationWindows(input,now);
  if(!Array.isArray(input.selectedStarts) || !input.selectedStarts.length) throw reservationError('Select at least one opening.');
  const selected=new Set(input.selectedStarts), slots=generated.filter(s=>selected.has(s.startAt));
  if(slots.length!==selected.size) throw reservationError('Selected openings changed. Check the time windows again.');
  const expiresAt=replacementWallTime(input.expiresLocal,input.timeZone);
  if(+expiresAt<=+now || +expiresAt>+new Date(slots.at(-1).startAt)) throw reservationError('Set an expiration in the future, no later than the last opening.');
  if(!Array.isArray(input.recipients) || !input.recipients.length || input.recipients.length>100) throw reservationError('Choose one to one hundred recipients.');
  const seen=new Set(), addresses=new Set();
  const recipients=input.recipients.map(r=>{
    const userId=r.userId==null ? null : Number(r.userId), staff=userId && roster.find(u=>Number(u.id)===userId);
    if(r.userId!=null && (!Number.isSafeInteger(userId) || userId<1))throw reservationError('Choose current employees from this agency.');
    if(userId && !staff) throw reservationError('Choose current employees from this agency.');
    const name=text(staff?.name || r.name,150), sendEmail=userId ? r.sendEmail!==false : true;
    if(!name) throw reservationError('Enter a name for each email recipient.');
    const email=sendEmail ? reservationEmail(r.email || staff?.email) : null;
    const key=userId ? `user:${userId}` : `email:${email}`;
    if(seen.has(key) || (email && addresses.has(email))) throw reservationError('Each person may be invited only once.');
    seen.add(key);if(email)addresses.add(email);
    return {userId,name,email,key};
  });
  const subject=text(input.subject || `Choose a time: ${title}`,180), message=text(input.message,3000);
  if(!subject || /[\r\n]/.test(subject) || !message) throw reservationError('Review the email subject and message.');
  return {title,type,modality,location:modality==='VIRTUAL'?'':location,meetingUrl:modality==='IN_PERSON'?'':meetingUrl,
    timeZone:input.timeZone,slots,recipients,subject,message,expiresAt:expiresAt.toISOString(),
    editor:{...input,recipients:input.recipients.map(r=>({...r}))}};
}
export function reservationSnapshot(event) {
  return reservationHash(JSON.stringify([event.status,event.title,reservationIso(event.start_at),reservationIso(event.end_at),event.location_text || '',event.google_meet_link || '']));
}
export function assertReservationClaim(offer, invitee, slot, modality, now = new Date()) {
  if(invitee.slot_id) throw reservationError('This invitation already has a reserved time.',409);
  if(offer.status!=='open' || parseUtcDate(offer.expires_at)<=now) throw reservationError('This invitation is closed or expired.',410);
  if(!slot || Number(slot.offer_id)!==Number(offer.id) || slot.status!=='open' || parseUtcDate(slot.start_at)<=now) throw reservationError('That time is no longer available. Choose another opening.',409);
  const config=reservationConfig(offer.config_json);
  if(!['VIRTUAL','IN_PERSON'].includes(modality) || (config.modality!=='BOTH' && config.modality!==modality)) throw reservationError('Choose an offered meeting format.');
  return config;
}
