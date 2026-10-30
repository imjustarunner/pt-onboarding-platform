import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import { handbookTenant } from './handbookTenant.js';
import { computeLineAmount, loadUserPaySystemContext } from './paySystem.service.js';
import { learningSessionServiceCode } from './learningServiceCompensation.js';

export const TUTORING_UNIT_CODE = 'TUTORING 15 MIN';
export function tutoringSessionQuantities(start, end) {
  const parse = value => value instanceof Date ? value : new Date(String(value).replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(String(value)) ? '' : 'Z'));
  const minutes = (parse(end).getTime() - parse(start).getTime()) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 12 * 60) throw new Error('Confirm actual tutoring start and end times before preparing payroll.');
  // Internal tutoring compensation uses actual time expressed in 15-minute units.
  // Keep partial units: an insurance billing threshold must not discard worked time.
  return { actualMinutes: minutes, units: minutes / 15, directHours: minutes / 60, indirectHours: minutes / 60 * 10 / 60 };
}
export async function createTutoringPayrollDraft(sessionId, actorUserId, db = pool) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(`SELECT s.*, a.id AS agency_id, a.slug AS agency_slug
      FROM learning_class_sessions s JOIN learning_program_classes c ON c.id=s.learning_class_id
      JOIN agencies a ON a.id=COALESCE((SELECT oa.agency_id FROM organization_affiliations oa WHERE oa.organization_id=c.organization_id AND oa.is_active=TRUE ORDER BY oa.id DESC LIMIT 1),c.organization_id) WHERE s.id=? FOR UPDATE`, [sessionId]);
    const session = rows[0];
    if (!session || handbookTenant({ slug: session.agency_slug }) !== 'nlu' || session.session_subtype !== 'tutoring' || session.status !== 'ended') { await conn.commit(); return { skipped: true }; }
    const service = learningSessionServiceCode(session);
    const homework = service === 'HOMEWORK HELP';
    const serviceCode = homework ? 'HOMEWORK HELP 15 MIN' : TUTORING_UNIT_CODE;
    const q = tutoringSessionQuantities(session.actual_started_at, session.ends_at);
    if (homework) q.indirectHours = 0;
    const [presenters] = await conn.execute(`SELECT p.user_id FROM learning_class_session_participants p
      JOIN user_agencies ua ON ua.user_id=p.user_id AND ua.agency_id=?
      WHERE p.session_id=? AND p.role='presenter'`, [session.agency_id, sessionId]);
    if (presenters.length !== 1) throw new Error('Confirm one assigned tutor for this session before preparing payroll.');
    const userId = presenters[0].user_id;
    if (!session.provider_user_id || Number(session.provider_user_id) !== Number(userId)) throw new Error('Confirm that the session’s assigned provider matches its single presenter before preparing payroll.');
    const claimDate = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Denver', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(session.ends_at instanceof Date ? session.ends_at : String(session.ends_at).replace(' ','T')+'Z'));
    const [existing] = await conn.execute(`SELECT id, user_id, payload_json FROM payroll_time_claims WHERE agency_id=?
      AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.source'))='learning_tutoring_session'
      AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.sessionId'))=?`, [session.agency_id, String(sessionId)]);
    const claims = [];
    for (const row of existing) {
      if (Number(row.user_id) !== Number(userId)) throw new Error('Reconcile the existing payroll claims for this session before changing its assigned provider.');
      const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
      if ((payload?.serviceCode || TUTORING_UNIT_CODE) !== serviceCode || (homework && payload?.part === 'indirect')) throw new Error('Reconcile the existing payroll claims before changing the session service type.');
    }
    for (const part of homework ? ['direct'] : ['direct','indirect']) {
      const found = existing.find(row => (typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json)?.part === part);
      if (found) { claims.push(found.id); continue; }
      const claim = await PayrollTimeClaim.create({ agencyId: session.agency_id, userId, submittedByUserId: actorUserId,
        claimType: 'tutoring_session', claimDate, db: conn,
        payload: { source:'learning_tutoring_session', sessionId, part, ...q, serviceCode,
          totalMinutes:part === 'direct' ? q.actualMinutes : q.indirectHours * 60,
          bucket:part, bucketRole:part, notes:part === 'direct' ? `${homework ? 'Homework Help' : 'Tutoring'}: verify actual session time and 15-minute units.` : 'Tutoring automatic indirect allowance: do not duplicate this time in another claim.' } });
      claims.push(claim.id);
    }
    await conn.commit();
    return { claimIds:claims, ...q, serviceCode, learningServiceCode:service, status:'submitted' };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}
export async function tutoringClaimAmount(claim, approvedHours = null) {
  const date = claim.claim_date instanceof Date ? claim.claim_date.toISOString().slice(0,10) : String(claim.claim_date).slice(0,10);
  const context = await loadUserPaySystemContext({ agencyId:claim.agency_id, userId:claim.user_id, periodEnd:date });
  const serviceCode = claim.payload?.serviceCode || TUTORING_UNIT_CODE;
  if (![TUTORING_UNIT_CODE,'HOMEWORK HELP 15 MIN'].includes(serviceCode)) throw new Error('Confirm the academic service type before approving this claim.');
  const homework = serviceCode === 'HOMEWORK HELP 15 MIN';
  if (!context.enabled || context.rateProfile?.[homework ? 'homeworkHelpRate' : 'tutoringRate'] == null) throw new Error('Confirm the employee’s category, level, and active program service rate before approving this claim.');
  const units = Number(claim.payload?.units);
  if (!Number.isFinite(units) || units <= 0) throw new Error('Confirm tutoring units before approval.');
  const result = computeLineAmount({ rateProfile:context.rateProfile, status:{...context.status, asOfDate:date}, serviceCode, quantity:units, rule:{category:homework ? 'homework_help' : 'tutoring',pay_divisor:4,credit_value:0.25} });
  if (result.rateLabel !== (homework ? 'homework_help_rate' : 'tutoring_rate')) throw new Error('The program rate is not effective on this session date. Review its historical compensation.');
  const indirect = claim.payload.part === 'indirect';
  if (homework && indirect) throw new Error('Homework Help has no automatic indirect allowance; submit actual compensable work separately.');
  const hours = approvedHours == null ? null : Number(approvedHours);
  if (hours != null && (!Number.isFinite(hours) || hours < 0)) throw new Error('Confirm tutoring hours before approval.');
  if (hours != null) return Math.round(hours * (indirect ? result.autoIndirectRate : result.rate) * 100) / 100;
  return indirect ? result.autoIndirectAmount : result.amount;
}
