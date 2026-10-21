import pool from '../config/database.js';
import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import LearningClassSession from '../models/LearningClassSession.model.js';
import {clientAgencyMembership} from '../services/clientServiceEnrollment.service.js';

const MANAGE_ROLE_ALLOWLIST = new Set([
  'super_admin',
  'admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'clinical_practice_assistant',
  'intern',
  'intern_plus'
]);

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function assertGroupSessionFeatureFlagEnabled(organizationId) {
  const [rows] = await pool.execute(
    `SELECT feature_flags FROM agencies WHERE id = ? LIMIT 1`,
    [Number(organizationId)]
  );
  const flags = parseFeatureFlags(rows?.[0]?.feature_flags);
  // Backward-compatible: if key does not exist, do not block.
  if (Object.prototype.hasOwnProperty.call(flags, 'groupClassSessionsEnabled') && flags.groupClassSessionsEnabled !== true) {
    const err = new Error('Group class sessions are disabled for this organization');
    err.status = 403;
    throw err;
  }
}

export async function assertLearningClassAccess(req, classId) {
  const cid = Number.parseInt(classId, 10);
  if (!Number.isInteger(cid) || cid <= 0) {
    const err = new Error('Invalid classId');
    err.status = 400;
    throw err;
  }
  if (!req.user?.id) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  const klass = await LearningProgramClass.findById(cid);
  if (!klass) {
    const err = new Error('Class not found');
    err.status = 404;
    throw err;
  }
  await assertGroupSessionFeatureFlagEnabled(klass.organization_id);

  const actorId = Number(req.user.id);
  const role = String(req.user.role || '').toLowerCase();
  if (role === 'super_admin') return { klass, actorRole: 'presenter', canManage: true };

  // Provider-side access via org membership
  const agencies = await User.getAgencies(actorId);
  const orgIds = new Set((agencies || []).map((a) => Number(a.id)).filter((n) => n > 0));
  if (MANAGE_ROLE_ALLOWLIST.has(role) && orgIds.has(Number(klass.organization_id || 0))) {
    const canManage = MANAGE_ROLE_ALLOWLIST.has(role);
    return { klass, actorRole: canManage ? 'presenter' : 'participant', canManage };
  }

  // Provider member of this class
  const providerMembers = await LearningProgramClass.listProviderMembers(cid);
  const providerMember = (providerMembers || []).find((m) => Number(m.provider_user_id) === actorId && String(m.membership_status || '').toLowerCase() !== 'removed');
  if (providerMember) {
    const label = String(providerMember.role_label || '').toLowerCase();
    const actorRole = label.includes('proctor')
      ? 'proctor'
      : (label.includes('co') && label.includes('presenter'))
          ? 'co_presenter'
          : (label.includes('presenter') ? 'presenter' : 'participant');
    return { klass, actorRole, canManage: actorRole !== 'participant' };
  }

  // Guardian access if linked to enrolled student
  if (role === 'guardian' || role === 'client_guardian') {
    const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: actorId });
    const linkedIds = new Set((linked || []).map((r) => Number(r.client_id)).filter((n) => n > 0));
    const classMembers = await LearningProgramClass.listClientMembers(cid);
    const hasChild = (classMembers || []).some((m) => linkedIds.has(Number(m.client_id)) && String(m.membership_status || '').toLowerCase() !== 'removed');
    if (hasChild) return { klass, actorRole: 'participant', canManage: false };
  }

  const err = new Error('Access denied for this class');
  err.status = 403;
  throw err;
}

export async function assertLearningSessionAccess(req, sessionId) {
  const sid = Number.parseInt(sessionId, 10);
  if (!Number.isInteger(sid) || sid <= 0) {
    const err = new Error('Invalid sessionId');
    err.status = 400;
    throw err;
  }
  const session = await LearningClassSession.findById(sid);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  const individual=session.session_subtype==='tutoring'||session.mode==='individual';
  if(individual&&['guardian','client_guardian','client'].includes(req.user?.role)){
    const [students]=await pool.execute('SELECT client_id FROM tutoring_session_clients WHERE session_id=?',[sid]);
    const links=await ClientGuardian.listClientsForGuardian({guardianUserId:req.user.id});
    const klass=await LearningProgramClass.findById(session.learning_class_id);
    const permitted=[];
    for(const student of students){
      const link=links.find(l=>Number(l.client_id)===Number(student.client_id));
      if(link&&!ClientGuardian.isNoView(link.permissions_json)&&link.permissions_json?.canViewAppointments!==false&&klass&&await clientAgencyMembership(student.client_id,klass.organization_id))permitted.push(student.client_id);
    }
    if(!permitted.length)throw Object.assign(new Error('This tutoring visit is not shared with your account.'),{status:403});
    return {session,klass,actorRole:'participant',canManage:false,canModerate:false};
  }
  const { klass, actorRole, canManage } = await assertLearningClassAccess(req, session.learning_class_id);

  // Session-level role override
  const roleRow = await LearningClassSession.getRoleForUser(sid, Number(req.user.id));
  const sessionRole = roleRow?.role ? String(roleRow.role) : actorRole;
  const canModerate = canManage || ['presenter', 'co_presenter', 'proctor'].includes(sessionRole);
  return { session, klass, actorRole: sessionRole, canManage, canModerate };
}

export async function listClassParticipantClientIds(classId) {
  const rows = await LearningProgramClass.listClientMembers(classId);
  return (rows || [])
    .filter((m) => String(m.membership_status || '').toLowerCase() !== 'removed')
    .map((m) => Number(m.client_id))
    .filter((n) => n > 0);
}

export async function canWriteEvidenceForClass(req, classId) {
  const { canManage } = await assertLearningClassAccess(req, classId);
  return !!canManage;
}

export async function getGuardianJoinInfoForClassAndSession(guardianUserId, classId, sessionId) {
  const session = await LearningClassSession.findById(sessionId);
  if (!session || Number(session.learning_class_id) !== Number(classId)) return null;
  const klass=await LearningProgramClass.findById(classId);
  if(!klass)return null;
  const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId });
  const linkedIds = new Set((linked || []).filter(r=>!ClientGuardian.isNoView(r.permissions_json)&&r.permissions_json?.canViewAppointments!==false).map((r) => Number(r.client_id)).filter((n) => n > 0));
  const classMembers = session.session_subtype==='tutoring'||session.mode==='individual' ? (await pool.execute('SELECT client_id FROM tutoring_session_clients WHERE session_id=?',[sessionId]))[0] : await LearningProgramClass.listClientMembers(classId);
  const candidates = (classMembers || [])
    .filter((m) => linkedIds.has(Number(m.client_id)) && String(m.membership_status || '').toLowerCase() !== 'removed')
    .map((m) => Number(m.client_id));
  const childIds=[];
  for(const id of candidates)if(await clientAgencyMembership(id,klass.organization_id))childIds.push(id);
  if (!childIds.length) return null;
  return {
    classId: Number(classId),
    sessionId: Number(sessionId),
    childIds
  };
}

export async function logClassSessionTelemetry({ sessionId, eventType, actorUserId = null, payload = null }) {
  await pool.execute(
    `INSERT INTO learning_class_session_activity
     (session_id, user_id, participant_identity, activity_type, payload_json)
     VALUES (?, ?, ?, 'system', ?)`,
    [
      Number(sessionId),
      actorUserId ? Number(actorUserId) : null,
      actorUserId ? `user-${Number(actorUserId)}` : 'system',
      JSON.stringify({ eventType, payload: payload || {} })
    ]
  );
}
