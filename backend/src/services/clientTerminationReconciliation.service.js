import crypto from 'node:crypto';
import {closeTerminatedClientRoster,hasTerminalClientStatus} from './clientTerminationRoster.service.js';
const fingerprint=row=>crypto.createHash('sha256').update(JSON.stringify([row.id,row.agency_id,row.status,row.client_status_id,row.provider_id,row.service_day,row.organization_id,row.assignment_fingerprint,row.terminated_at,row.updated_at,row.active_assignments,row.future_appointments,row.future_office_events,row.future_booking_plans,row.future_provider_events,row.future_clinical_sessions])).digest('hex');
export function terminationReconciliationDecision(row) {
  const holds=[];
  if(!row.terminated_at)holds.push('No recorded termination');
  if(!hasTerminalClientStatus(row))holds.push('Current catalog status may represent resumed care; review required');
  if(Number(row.future_appointments)||Number(row.future_office_events)||Number(row.future_booking_plans)||Number(row.future_provider_events)||Number(row.future_clinical_sessions))holds.push('Future or ongoing care is scheduled; clinical review required');
  return {eligible:holds.length===0,holds};
}
export async function buildTerminationReconciliationPlan(db,{agencyId,clinicalSchema=process.env.CLINICAL_DB_NAME||'onboarding_stage_clinical'}={}) {
  if(!Number.isSafeInteger(Number(agencyId))||Number(agencyId)<1)throw new Error('A specific agency is required');
  if(!/^[A-Za-z0-9_]+$/.test(clinicalSchema))throw new Error('Invalid clinical database name');
  const [rows]=await db.execute(`SELECT c.id,c.agency_id,c.status,c.client_status_id,c.provider_id,c.service_day,c.organization_id,c.terminated_at,c.updated_at,
    s.status_key AS client_status_key,
    (SELECT COUNT(*) FROM client_provider_assignments p WHERE p.client_id=c.id AND p.is_active=TRUE) AS active_assignments,
    (SELECT SHA2(GROUP_CONCAT(CONCAT_WS(':',p.id,p.organization_id,p.provider_user_id,COALESCE(p.service_day,''),p.is_primary) ORDER BY p.id SEPARATOR '|'),256) FROM client_provider_assignments p WHERE p.client_id=c.id AND p.is_active=TRUE) AS assignment_fingerprint,
    (SELECT COUNT(DISTINCT a.id) FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id WHERE p.client_id=c.id AND a.end_at>=UTC_TIMESTAMP() AND a.status IN ('scheduled','confirmed','draft')) AS future_appointments,
    (SELECT COUNT(*) FROM office_events e WHERE e.client_id=c.id AND e.end_at>=UTC_TIMESTAMP() AND e.status<>'CANCELLED') AS future_office_events,
    (SELECT COUNT(*) FROM office_booking_plans bp WHERE bp.is_active=TRUE AND (bp.active_until_date IS NULL OR bp.active_until_date>=UTC_DATE()) AND CAST(JSON_UNQUOTE(JSON_EXTRACT(bp.session_context_json,'$.clientId')) AS UNSIGNED)=c.id) AS future_booking_plans,
    (SELECT COUNT(*) FROM provider_schedule_events p WHERE p.client_id=c.id AND p.end_at>=UTC_TIMESTAMP() AND p.status='ACTIVE') AS future_provider_events,
    (SELECT COUNT(*) FROM \`${clinicalSchema}\`.clinical_sessions cs WHERE cs.client_id=c.id AND cs.agency_id=c.agency_id AND cs.scheduled_end_at>=UTC_TIMESTAMP() AND cs.encounter_status IN ('scheduled','confirmed')) AS future_clinical_sessions
    FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.agency_id=? AND c.terminated_at IS NOT NULL
      AND COALESCE(c.is_demo,0)=0 AND COALESCE(c.created_via_dev_fill,0)=0 AND (c.status<>'ARCHIVED' OR c.provider_id IS NOT NULL
        OR EXISTS(SELECT 1 FROM client_provider_assignments p WHERE p.client_id=c.id AND p.is_active=TRUE)) ORDER BY c.id`,[Number(agencyId)]);
  const entries=rows.map(row=>({clientId:row.id,agencyId:row.agency_id,fingerprint:fingerprint(row),catalogStatus:row.client_status_key,
    activeAssignments:Number(row.active_assignments),legacyProviderAssigned:!!row.provider_id,...terminationReconciliationDecision(row)}));
  const summary={candidateClients:entries.length,eligibleToArchive:entries.filter(e=>e.eligible).length,requiresReview:entries.filter(e=>!e.eligible).length,
    activeAssignmentsToEnd:entries.filter(e=>e.eligible).reduce((n,e)=>n+e.activeAssignments,0),legacyProvidersToClear:entries.filter(e=>e.eligible&&e.legacyProviderAssigned).length,
    scheduledCareRequiresReview:entries.filter(e=>e.holds.some(h=>h.startsWith('Future'))).length};
  return {version:1,agencyId:Number(agencyId),generatedAt:new Date().toISOString(),summary,entries};
}
/** Explicitly reviewed apply only; no calendar cancellation, record deletion,
 * notifications, or changes to conflicted/reopened episodes are performed. */
export async function applyTerminationReconciliationPlan(pool,plan,{actorUserId,enabled=false}={}) {
  if(enabled!==true||!Number.isSafeInteger(Number(actorUserId))||Number(actorUserId)<1)throw new Error('Explicit reviewed apply and an actor are required');
  if(plan?.version!==1||!Array.isArray(plan.entries))throw new Error('A reviewed plan is required');
  const db=await pool.getConnection();
  const entries=plan.entries.filter(e=>e.eligible).sort((a,b)=>Number(a.clientId)-Number(b.clientId));
  const locked=[];
  try{
    // The same advisory locks used by every standard booking/termination path
    // prevent new care while the reviewed roster changes are being applied.
    for(const entry of entries){
      if(!Number.isSafeInteger(Number(entry.clientId))||Number(entry.clientId)<1)throw new Error('Invalid reviewed client');
      const [[lock]]=await db.execute('SELECT GET_LOCK(?,8) AS acquired',[`client-schedule:${entry.clientId}`]);
      if(Number(lock?.acquired)!==1)throw new Error('Scheduling is changing; retry after clinical review');
      locked.push(entry.clientId);
    }
    await db.beginTransaction();
    // Lock all candidate records before the first consistent read. Under MySQL
    // REPEATABLE READ this ensures the snapshot includes any edits that commit
    // while we are waiting for a client row lock.
    for(const entry of entries){
      await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[entry.clientId,plan.agencyId]);
      await db.execute('SELECT id FROM client_provider_assignments WHERE client_id=? FOR UPDATE',[entry.clientId]);
    }
    const fresh=await buildTerminationReconciliationPlan(db,{agencyId:plan.agencyId});
    const byId=new Map(fresh.entries.map(e=>[e.clientId,e]));let closed=0;
    for(const entry of entries){
      const current=byId.get(entry.clientId);
      if(!current?.eligible||current.fingerprint!==entry.fingerprint)throw new Error('The reviewed records changed; generate and review a new plan');
      await closeTerminatedClientRoster(db,{clientId:entry.clientId,actorUserId:Number(actorUserId)});closed++;
    }
    await db.commit();return {closed,heldForReview:plan.entries.filter(e=>!e.eligible).length};
  }catch(error){await db.rollback();throw error;}finally{
    for(const id of locked.reverse())await db.execute('SELECT RELEASE_LOCK(?)',[`client-schedule:${id}`]).catch(()=>{});
    db.release();
  }
}
