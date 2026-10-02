import {createHmac,timingSafeEqual} from 'node:crypto';
import config from '../config/config.js';
const signature=id=>createHmac('sha256',config.jwt.secret).update(`shared-interview-calendar:${id}`).digest('base64url');
export function interviewCalendarReference(eventId){const id=Number(eventId);if(!Number.isSafeInteger(id)||id<=0)throw new Error('Interview event required.');return `c-${id}-${signature(id)}`;}
export function interviewCalendarEventId(ref){
 const m=/^c-(\d+)-([\w-]{43})$/.exec(String(ref||''));if(!m)return null;
 const id=Number(m[1]);if(!Number.isSafeInteger(id)||id<=0)return null;
 return timingSafeEqual(Buffer.from(m[2]),Buffer.from(signature(id)))?id:null;
}
export function interviewCalendarJoinUrl(personalUrl,eventId){
 const url=new URL(personalUrl);
 if(!['http:','https:'].includes(url.protocol)||!url.pathname.includes('/join/'))throw new Error('Invalid interview URL.');
 const prefix=url.pathname.split('/join/')[0];
 url.pathname=`${prefix}/join/team-meeting/${interviewCalendarReference(eventId)}`;url.search='';url.hash='';return url.toString();
}
