/**
 * When outbound mail would fall back to the platform ai@ mailbox because a
 * tenant alias / sender identity is missing, create a task for Michael and
 * do not send the email.
 */
import User from '../models/User.model.js';
import Task from '../models/Task.model.js';
import { inferTaskCategoryFromTitle, normalizeTaskCategories } from '../constants/taskCategories.js';

const MICHAEL_EMAIL = 'michael@plottwistco.com';
const FALLBACK_ASSIGNEE_USER_ID = 501; // Michael Mendez (known staging/prod id)

function isPlatformAiMailbox(email) {
  const e = String(email || '').trim().toLowerCase();
  return e === 'ai@plottwistco.com' || e.startsWith('ai@');
}

export { isPlatformAiMailbox };

export function isForbiddenFallbackFrom({ fromEmail = null, usedFallbackSender = false, reason = null } = {}) {
  if (isPlatformAiMailbox(fromEmail)) return true;
  if (usedFallbackSender && (!fromEmail || isPlatformAiMailbox(fromEmail))) return true;
  const r = String(reason || '').toLowerCase();
  return r.includes('missing_sender') || r.includes('fallback_sender');
}

async function resolveMichaelUserId() {
  try {
    const u = await User.findByEmail(MICHAEL_EMAIL);
    if (u?.id) return Number(u.id);
  } catch {
    /* ignore */
  }
  return FALLBACK_ASSIGNEE_USER_ID;
}

/**
 * Create a task for Michael and return metadata. Never sends mail.
 */
export async function createMissingAliasTaskAndBlock({
  to = null,
  subject = null,
  agencyId = null,
  templateType = null,
  triggerKey = null,
  fromEmail = null,
  reason = 'missing_sender_identity',
  communicationId = null
} = {}) {
  const assigneeId = await resolveMichaelUserId();
  const title = `Email blocked: missing sender alias${agencyId ? ` (agency ${agencyId})` : ''}`;
  const description = [
    'An outbound email was blocked because the tenant sender alias / identity is not set up.',
    'It would have fallen back to ai@plottwistco.com — that fallback is not allowed.',
    '',
    `To: ${to || '—'}`,
    `Subject: ${subject || '—'}`,
    `Agency id: ${agencyId || '—'}`,
    `Template / trigger: ${templateType || triggerKey || '—'}`,
    `Attempted From: ${fromEmail || '—'}`,
    `Reason: ${reason}`,
    communicationId ? `Communication id: ${communicationId}` : null,
    '',
    'Please configure the correct From identity in Email Settings for this agency, then resend if needed.'
  ].filter(Boolean).join('\n');

  const categories = normalizeTaskCategories(inferTaskCategoryFromTitle(title));
  let taskId = null;
  try {
    const task = await Task.create({
      taskType: 'custom',
      title: title.slice(0, 255),
      description,
      assignedToUserId: assigneeId,
      assignedByUserId: assigneeId,
      assignedToAgencyId: agencyId || undefined,
      taskListId: 10,
      projectId: 3,
      urgency: 'high',
      isPrivate: false,
      categories
    });
    taskId = task?.id || null;
  } catch (e) {
    console.error('[emailAliasFallback] Task.create failed:', e?.message || e);
  }

  return {
    blocked: true,
    reason: 'missing_sender_alias_blocked',
    taskId,
    assignedToUserId: assigneeId
  };
}
