import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';

export async function clientSessionSnapshots(agencyId, clientIds, mainDb=pool, careDb=clinicalPool, providerId=null) {
  if (!clientIds.length) return [];
  const placeholders=clientIds.map(()=>'?').join(',');
  const aggregate=(clientColumn,startColumn,statusColumn,from,where) => `SELECT ${clientColumn} AS client_id,
    MIN(CASE WHEN ${startColumn}>=UTC_TIMESTAMP() AND ${statusColumn} IN ('scheduled','confirmed','client_confirmed','in_progress','reschedule_requested','cancellation_requested') THEN ${startColumn} END) AS next_at,
    MAX(CASE WHEN ${startColumn}<UTC_TIMESTAMP() AND ${statusColumn} NOT IN ('cancelled','canceled','voided','void','rescheduled','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled') THEN ${startColumn} END) AS last_at,
    MAX(CASE WHEN ${startColumn}<UTC_TIMESTAMP() AND ${statusColumn}='completed' THEN ${startColumn} END) AS completed_at
    FROM ${from} WHERE ${where} GROUP BY ${clientColumn}`;
  const providerParams=providerId?[providerId]:[];
  const results=await Promise.allSettled([
    mainDb.execute(aggregate('p.client_id','a.start_at','a.status',
      'appointments a JOIN appointment_participants p ON p.appointment_id=a.id',
      `a.agency_id=? AND p.client_id IN (${placeholders}) AND p.role IN ('client','student')${providerId?' AND a.provider_user_id=?':''}`),[agencyId,...clientIds,...providerParams]),
    careDb.execute(aggregate('s.client_id','s.scheduled_start_at','s.encounter_status','clinical_sessions s',
      `s.agency_id=? AND s.client_id IN (${placeholders})${providerId?' AND s.provider_user_id=?':''}`),[agencyId,...clientIds,...providerParams])
  ]);
  // A missing source must be visible as unavailable instead of looking like no appointments.
  const unavailable=results.some(result=>result.status==='rejected');
  const snapshots=new Map(clientIds.map(clientId=>[clientId,{clientId,nextAt:null,lastAt:null,lastCompletedAt:null,unavailable}]));
  for (const result of results) {
    if (result.status!=='fulfilled') continue;
    for (const row of result.value[0]) {
      const value=snapshots.get(Number(row.client_id));
      for (const [source,target,earliest] of [['next_at','nextAt',true],['last_at','lastAt',false],['completed_at','lastCompletedAt',false]]) {
        const date=row[source];
        if (date && (!value[target] || (earliest ? new Date(date)<new Date(value[target]) : new Date(date)>new Date(value[target])))) value[target]=date;
      }
    }
  }
  return [...snapshots.values()];
}
