import { createHash, randomBytes } from 'node:crypto';


export const hashHoldToken = (token) => createHash('sha256').update(String(token || '')).digest('hex');
export function holdError(message, status = 409) { return Object.assign(new Error(message), { status }); }
export function validateHoldWindow(startAt, endAt, now = Date.now()) {
  const start = new Date(startAt), end = new Date(endAt);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || +start <= now || +end <= +start ||
      +end - +start > 4 * 3600000 || +start - now > 120 * 86400000) {
    throw holdError('Choose a valid future opening within the next 120 days.', 400);
  }
  return { start, end };
}
const sqlDate = (date) => new Date(typeof date === 'string' && /^\d{4}-\d{2}-\d{2} /.test(date) ? date.replace(' ', 'T') + 'Z' : date).toISOString().slice(0, 23).replace('T', ' ');

// Shared by hold creation and public request insertion. Serializes overlapping times,
// including virtual/in-person and affiliations belonging to the same provider.
export async function withProviderSelectionLock(pool, providerId, action) {
  const connection = await pool.getConnection();
  const key = `public-provider-selection:${Number(providerId)}`;
  let locked = false;
  try {
    const [rows] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [key]);
    locked = Number(rows?.[0]?.acquired) === 1;
    if (!locked) throw holdError('This opening is being checked. Please try again.');
    return await action(connection);
  } finally {
    try { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [key]); }
    finally { connection.release(); }
  }
}

// Wall-clock weekly recurrence, including changes to daylight-saving offset.
const utcDate = value => value instanceof Date ? value : new Date(String(value).replace(' ', 'T').replace(/(?<!Z)$/, 'Z'));
function localParts(date, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}
function wallDate(parts, timeZone) {
  const wanted = Date.UTC(parts.year, parts.month-1, parts.day, parts.hour, parts.minute, parts.second || 0);
  let value = wanted;
  for(let i=0;i<4;i++) {
    const p = localParts(new Date(value), timeZone);
    const delta = wanted - Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    if (!delta) return new Date(value);
    value += delta;
  }
  return null; // A wall time skipped by spring-forward is not an opening.
}
export function expandWeeklyHold(hold, from, to) {
  const start = utcDate(hold.start_at || hold.startAt), end = utcDate(hold.end_at || hold.endAt);
  const timeZone = hold.time_zone || hold.timeZone || 'UTC';
  const base = localParts(start, timeZone);
  const weekday = new Date(Date.UTC(base.year,base.month-1,base.day)).getUTCDay();
  const intervals = [];
  const first = new Date(+new Date(from)-86400000);
  first.setUTCHours(0,0,0,0);
  for(let day=+first;day<+new Date(to)+86400000;day+=86400000) {
    const d = new Date(day);
    if(d.getUTCDay() !== weekday) continue;
    const occurrence = wallDate({...base,year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()},timeZone);
    if(occurrence) occurrence.setUTCMilliseconds(start.getUTCMilliseconds());
    if(!occurrence || +occurrence < +start) continue;
    const finish = new Date(+occurrence + (+end-+start));
    if(+occurrence < +new Date(to) && +finish > +new Date(from)) intervals.push({start:occurrence,end:finish});
  }
  return intervals;
}
export async function readActiveHolds(connection, providerId) {
  try {
    const [rows] = await connection.execute(`SELECT id, agency_id, token_hash, time_zone,
      DATE_FORMAT(start_at, '%Y-%m-%dT%H:%i:%s.%fZ') start_at,
      DATE_FORMAT(end_at, '%Y-%m-%dT%H:%i:%s.%fZ') end_at
      FROM public_provider_slot_holds WHERE provider_id = ? AND released_at IS NULL`, [providerId]);
    return rows;
  } catch(error) {
    if(error.code !== 'ER_NO_SUCH_TABLE') throw error;
    return [];
  }
}
const overlaps = (a,b) => +a.start < +b.end && +a.end > +b.start;
export async function assertNoSelectionConflict(connection, {providerId,startAt,endAt,token='',agencyId,recurring=false,timeZone='UTC'}) {
  const holds = await readActiveHolds(connection, Number(providerId));
  const from = new Date(startAt), to = recurring ? new Date(+from+370*86400000) : new Date(endAt);
  const wanted = recurring ? expandWeeklyHold({startAt,endAt,timeZone},from,to) : [{start:from,end:new Date(endAt)}];
  for(const hold of holds) {
    if(Number(hold.agency_id) === Number(agencyId) && hold.token_hash === hashHoldToken(token)) continue;
    if(expandWeeklyHold(hold,from,to).some(h => wanted.some(w => overlaps(h,w)))) {
      throw holdError('This weekly opening is held for a pending intake. Please choose another time.');
    }
  }
  const [requests] = await connection.execute(`SELECT requested_start_at, requested_end_at FROM public_appointment_requests
    WHERE provider_id = ? AND requested_end_at > ?
    AND UPPER(COALESCE(status, 'PENDING')) NOT IN ('DECLINED', 'CANCELLED')`,[Number(providerId),sqlDate(from)]);
  if(requests.some(r => {
    const interval = {start:utcDate(r.requested_start_at),end:utcDate(r.requested_end_at)};
    const windows = recurring ? expandWeeklyHold({startAt,endAt,timeZone},interval.start,interval.end) : wanted;
    return windows.some(w => overlaps(w,interval));
  })) throw holdError('This weekly opening already has an appointment request. Please choose another time.');
}
export async function resolveClientProviderHolds(connection,{clientId,userId=null,reason='PLACEMENT_CHANGED'}) {
  // Called by explicit assignment mutations, never by a profile read or intake preference.
  try { await connection.execute(`UPDATE public_provider_slot_holds SET released_at=UTC_TIMESTAMP(3), resolution=?, resolved_by_user_id=?
    WHERE client_id=? AND released_at IS NULL`,[reason,userId,clientId]); }
  catch(error) { if(error.code !== 'ER_NO_SUCH_TABLE') throw error; }
}
export function createPublicProviderHoldService(pool) {
  return {
    async create({agencyId,providerId,serviceType,modality,startAt,endAt,timeZone='UTC',validateAvailability}) {
      const {start,end} = validateHoldWindow(startAt,endAt);
      localParts(start,timeZone); // Reject an invalid timezone before acquiring a lock.
      return withProviderSelectionLock(pool,providerId,async connection => {
        await assertNoSelectionConflict(connection,{agencyId,providerId,startAt:start,endAt:end,recurring:true,timeZone});
        await validateAvailability();
        const token=randomBytes(32).toString('hex');
        await connection.execute(`INSERT INTO public_provider_slot_holds
          (agency_id,provider_id,service_type,modality,start_at,end_at,token_hash,expires_at,time_zone)
          VALUES (?,?,?,?,?,?,?,NULL,?)`,[agencyId,providerId,serviceType,modality,sqlDate(start),sqlDate(end),hashHoldToken(token),timeZone]);
        return {token,expiresAt:null,recurring:true,timeZone,startAt:start.toISOString(),endAt:end.toISOString(),providerId,serviceType,modality};
      });
    },
    async status({agencyId,token}) {
      const [rows]=await pool.execute('SELECT released_at FROM public_provider_slot_holds WHERE agency_id=? AND token_hash=?',[agencyId,hashHoldToken(token)]);
      return !!rows.length && !rows[0].released_at;
    },
    async attach({agencyId,providerId,token,clientId}) {
      // A bearer selection may bind once. Replays cannot steal an existing client's hold.
      const [result]=await pool.execute(`UPDATE public_provider_slot_holds SET client_id=?
        WHERE agency_id=? AND provider_id=? AND token_hash=? AND released_at IS NULL AND (client_id IS NULL OR client_id=?)`,
        [clientId,agencyId,providerId,hashHoldToken(token),clientId]);
      return result.affectedRows > 0;
    },
    async release({agencyId,token}) {
      await pool.execute(`UPDATE public_provider_slot_holds SET released_at=UTC_TIMESTAMP(3),resolution='USER_RELEASED'
        WHERE agency_id=? AND token_hash=? AND released_at IS NULL`,[agencyId,hashHoldToken(token)]);
    }
  };
}
