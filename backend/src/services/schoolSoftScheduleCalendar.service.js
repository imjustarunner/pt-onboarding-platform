import { cancellationSchoolRoster } from './cancellationSchoolRoster.service.js';
import { schoolAbsenceHistory } from './schoolAbsenceHistory.service.js';
import { DAY_ABSENCE_EXPLANATION } from './dayAbsencePolicy.service.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import pool from '../config/database.js';

export function createSchoolSoftScheduleCalendar({ roster = cancellationSchoolRoster, history = schoolAbsenceHistory, database = pool } = {}) {
  async function list({ agencyId, providerId, startDate, endDate, timeZone, appointments = null }) {
    if (!appointments) {
      const [rows] = await database.execute(`SELECT p.client_id,a.start_at FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id
        WHERE a.agency_id=? AND a.provider_user_id=? AND a.start_at>=? AND a.start_at<?`,
      [agencyId,providerId,wallMysqlToUtcMysql(`${startDate} 00:00:00`,timeZone),wallMysqlToUtcMysql(`${endDate} 00:00:00`,timeZone)]);
      const dateOf = value => new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value instanceof Date ? value : new Date(String(value).replace(' ','T')+'Z'));
      appointments = rows.map(r => ({ clientId:Number(r.client_id), date:dateOf(r.start_at) }));
    }
    const saved = await history.list({ agencyId, providerId, startDate, endDate });
    const results = new Map();
    const key = (date, clientId, schoolId) => `${agencyId}:${providerId}:${date}:${clientId}:${schoolId}`;
    for (let date = startDate, days = 0; date < endDate && days < 32; date = addDaysYmd(date, 1), days++) {
      for (const row of await roster.list({ agencyId, providerId, date })) {
        if (appointments.some(a => Number(a.clientId) === Number(row.client_id) && a.date === date)) continue;
        const slots = row.slots || [];
        results.set(key(date,row.client_id,row.school_id), { key: key(date,row.client_id,row.school_id), agencyId, providerId,
          clientId: Number(row.client_id), schoolId: Number(row.school_id), date, schoolName: row.school_name,
          clientName: row.client_name || row.client_initials || `Client #${row.client_id}`, timeZone,
          slots: slots.map(s => ({ id: s.id, startTime: s.startTime, endTime: s.endTime,
            startAt: s.startTime ? wallMysqlToUtcMysql(`${date} ${s.startTime}`,timeZone)?.replace(' ','T') + 'Z' : null,
            endAt: s.endTime ? wallMysqlToUtcMysql(`${date} ${s.endTime}`,timeZone)?.replace(' ','T') + 'Z' : null })),
          explanation: DAY_ABSENCE_EXPLANATION, source: 'school_soft_schedule', canceled: false });
      }
    }
    // Preserve canceled occurrences after later assignment/slot edits.
    for (const record of saved) {
      const k = key(record.date,record.clientId,record.schoolId);
      results.set(k, { ...results.get(k), ...record, key: k, timeZone, explanation: DAY_ABSENCE_EXPLANATION, canceled: true });
    }
    return [...results.values()].sort((a,b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
  }
  // Bulk read adapter for the practice agenda: one roster read per day, not per provider.
  async function listMany({ agencyId, providerIds, startDate, endDate, timeZone, appointments = [] }) {
    if (!providerIds.length) return [];
    const results = new Map();
    const key = (providerId,date,clientId,schoolId) => `${agencyId}:${providerId}:${date}:${clientId}:${schoolId}`;
    const booked = new Set(appointments.map(a => `${a.providerId}:${a.date}:${a.clientId}`));
    for (let date=startDate, days=0; date<endDate && days<32; date=addDaysYmd(date,1), days++) {
      for (const row of await roster.readMany({agencyId,providerIds,date})) {
        const providerId=Number(row.provider_id), clientId=Number(row.client_id), schoolId=Number(row.school_id);
        if (booked.has(`${providerId}:${date}:${clientId}`)) continue;
        const k=key(providerId,date,clientId,schoolId);
        results.set(k,{key:k,agencyId,providerId,clientId,schoolId,date,schoolName:row.school_name,
          clientName:row.client_name || row.client_initials || `Client #${clientId}`,timeZone,
          slots:(row.slots || []).map(s=>({id:s.id,startTime:s.startTime,endTime:s.endTime,
            startAt:s.startTime ? wallMysqlToUtcMysql(`${date} ${s.startTime}`,timeZone)?.replace(' ','T')+'Z' : null,
            endAt:s.endTime ? wallMysqlToUtcMysql(`${date} ${s.endTime}`,timeZone)?.replace(' ','T')+'Z' : null})),
          explanation:DAY_ABSENCE_EXPLANATION,source:'school_soft_schedule',canceled:false});
      }
    }
    for (const record of await history.list({agencyId,providerIds,startDate,endDate})) {
      const k=key(record.providerId,record.date,record.clientId,record.schoolId);
      results.set(k,{...results.get(k),...record,key:k,timeZone,explanation:DAY_ABSENCE_EXPLANATION,canceled:true});
    }
    return [...results.values()];
  }
  return { list, listMany };
}
export const schoolSoftScheduleCalendar = createSchoolSoftScheduleCalendar();
