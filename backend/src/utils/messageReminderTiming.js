import { isValidTimeZone, zonedWallTimeToUtc } from './zonedWallTime.util.js';

const DEFAULT_BLOCKS = [1, 2, 3, 4, 5].map(dayOfWeek => ({ dayOfWeek, startMinutes: 7 * 60, endMinutes: 19 * 60 }));
const RESPONSE_CUTOFF = 17 * 60;
function policy(schedule = {}, timeZone) {
  const blocks = schedule.enabled !== false && schedule.blocks?.length ? schedule.blocks : DEFAULT_BLOCKS;
  return {
    blocks,
    timeZone: [schedule.timezone, timeZone, 'America/Denver'].find(isValidTimeZone)
  };
}
function local(date, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
}
const minutes = d => d.getUTCHours() * 60 + d.getUTCMinutes();
const blocksFor = (p, d) => p.blocks.filter(b => Number(b.dayOfWeek) === d.getUTCDay()).sort((a, b) => a.startMinutes - b.startMinutes);
function nextDay(d, p) {
  for (let n = 0; n < 7; n++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (blocksFor(p, d).length) return;
  }
}
function nextWindow(d, p) {
  for (let n = 0; n < 8; n++) {
    for (const b of blocksFor(p, d)) {
      if (minutes(d) < b.startMinutes) {
        d.setUTCHours(0, b.startMinutes, 0, 0);
        return d;
      }
      if (minutes(d) < b.endMinutes) return d;
    }
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
  }
  return new Date(NaN);
}
export function isMessageReminderWindow(now, schedule, timeZone) {
  const p = policy(schedule, timeZone);
  const d = local(now, p.timeZone);
  return blocksFor(p, d).some(b => minutes(d) >= b.startMinutes && minutes(d) < b.endMinutes);
}
/** Legacy 24/48 settings mean one/two scheduled business days, not accumulated hours.
 * Mail arriving at/after 5 p.m. begins its response day at the next opening.
 * Delivery uses the provider's Availability Hours (default weekdays 7 a.m.–7 p.m.).
 * Fri 4 p.m. -> Mon 4 p.m.; Mon 6 p.m. -> Wed 7 a.m. with the default schedule.
 * Disabling general quiet hours does not remove the reminder's business-day protection.
 */
export function messageReminderDueAt(receivedAt, { schedule, timeZone, delayHours = 24 } = {}) {
  if (receivedAt == null || receivedAt === '') return new Date(NaN);
  const received = new Date(receivedAt);
  if (!Number.isFinite(received.getTime())) return new Date(NaN);
  const p = policy(schedule, timeZone);
  let d = local(received, p.timeZone);
  if (minutes(d) >= RESPONSE_CUTOFF) {
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
  }
  d = nextWindow(d, p);
  const days = Math.min(7, Math.max(1, Math.ceil((Number(delayHours) || 24) / 24)));
  for (let day = 0; day < days; day++) nextDay(d, p);
  d = nextWindow(d, p);
  if (!Number.isFinite(d.getTime())) return d;
  return zonedWallTimeToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), timeZone: p.timeZone });
}
