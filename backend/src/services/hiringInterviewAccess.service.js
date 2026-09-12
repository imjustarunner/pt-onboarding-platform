import User from '../models/User.model.js';
import { getUserCapabilities } from '../utils/capabilities.js';

export async function canAccessHiringInterview(actor, interview) {
  const uid = Number(actor?.id);
  if (!uid || !interview || uid === Number(interview.candidate_user_id)) return false;
  const user = await User.findById(uid);
  const caps = getUserCapabilities(user, { effectiveRole: actor.effectiveRole });
  if (!caps.canAccessPlatform) return false;
  if (user?.role === 'super_admin') return true;
  const agencies = await User.getAgencies(uid);
  if (!agencies.some(a => Number(a.id) === Number(interview.agency_id))) return false;
  let ids = interview.interviewer_user_ids_json || interview.interviewer_user_ids || [];
  if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch { ids = []; } }
  return !!caps.canManageHiring || (Array.isArray(ids) && ids.map(Number).includes(uid));
}

export async function requireHiringInterviewAccess(actor, interview) {
  if (!(await canAccessHiringInterview(actor, interview))) {
    throw Object.assign(new Error('Only assigned interviewers and hiring managers can access this interview.'), { status: 403 });
  }
}
