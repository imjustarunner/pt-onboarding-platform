import {utcDateToZonedYmd} from './zonedWallTime.util.js';
function storedDay(value) {
  const raw=value instanceof Date && Number.isFinite(value.getTime())?value.toISOString():String(value||'').trim();
  const day=raw.slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const check=new Date(`${day}T12:00:00Z`);
  return Number.isFinite(check.getTime()) && check.toISOString().slice(0,10)===day?day:null;
}
/** SQL DATEs keep their calendar day; a missing date uses the agency's day, not UTC. */
export function referralSubmissionDate(value,{storedValue=null,now=new Date(),timeZone='America/Denver'}={}) {
  return storedDay(value) || storedDay(storedValue) || utcDateToZonedYmd(now,timeZone);
}
