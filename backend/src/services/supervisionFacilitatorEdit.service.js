import User from '../models/User.model.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { supervisionCoFacilitatorIds, supervisionFacilitatorIds } from '../utils/supervisionFacilitators.js';

export async function resolveSupervisionFacilitatorEdit(session, body) {
  if (body.supervisorUserId === undefined && body.coFacilitatorUserId === undefined && body.coFacilitatorUserIds === undefined) return {};
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (session.session_type !== 'group') fail('Facilitator changes are available for group supervision.');
  const supervisorUserId = Number(body.supervisorUserId ?? session.supervisor_user_id);
  const raw = body.coFacilitatorUserIds !== undefined ? body.coFacilitatorUserIds
    : body.coFacilitatorUserId !== undefined ? (body.coFacilitatorUserId == null ? [] : [body.coFacilitatorUserId])
    : supervisionCoFacilitatorIds(session);
  if (!Number.isSafeInteger(supervisorUserId) || supervisorUserId < 1 || !Array.isArray(raw) || raw.length > 10) fail('Select valid facilitators.');
  const coFacilitatorUserIds = [...new Set(raw.map(Number))];
  if (coFacilitatorUserIds.some(id => !Number.isSafeInteger(id) || id < 1 || id === supervisorUserId)) fail('A facilitator cannot also be a cofacilitator.');
  const previous = new Set(supervisionFacilitatorIds(session));
  for (const id of [supervisorUserId, ...coFacilitatorUserIds]) {
    if (previous.has(id)) continue;
    const user = await User.findById(id);
    if (!user || !await hasActiveMeetingMembership(session.agency_id, id)) fail('Facilitators must be active members of this agency.');
    const admin = ['super_admin', 'superadmin', 'admin', 'support', 'clinical_practice_assistant'].includes(String(user.role).toLowerCase());
    const supervisor = ['supervisor'].includes(user.role) || [true, 1, '1'].includes(user.has_supervisor_privileges);
    if (!admin && !(supervisor && [true, 1, '1'].includes(user.group_supervision_eligible))) fail('Select an administrator or a supervisor with group supervision privileges.');
  }
  return { supervisorUserId, coFacilitatorUserIds };
}
