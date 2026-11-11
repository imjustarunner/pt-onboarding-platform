import { reactive } from 'vue';
import api from '../../services/api';

export const COMMENT_BUTTON = '/auricwell/session-comments/secure-session-button.png';
export const COMMENT_ICON = '/auricwell/session-comments/secure-envelope-shield.png';
export const secureCommentState = reactive({ selected: null, revision: 0, scopeKey: '', enabled: true, badges: {} });
export const commentApi = api;
export const commentRoot = '/secure-session-comments';
export function canUseSessionComments(role) { return ['provider','provider_plus','intern','intern_plus','clinician','therapist','supervisor','clinical_practice_assistant','admin','super_admin','client','client_guardian'].includes(String(role || '').toLowerCase()); }
export function openSecureSessionComment(appointmentId, clientId = null) {
  if (Number(appointmentId) > 0) secureCommentState.selected = { appointmentId: Number(appointmentId), clientId: Number(clientId) || null };
}
export function closeSecureSessionComment() { secureCommentState.selected = null; }
export function commentsChanged() { secureCommentState.revision++; }
export function setSecureCommentsScope(key, enabled = true) {
  secureCommentState.enabled = enabled;
  secureCommentState.scopeKey = String(key || '');
  secureCommentState.selected = null;
  secureCommentState.badges = {};
  secureCommentState.revision++;
  pending.clear();
}
export function commentDate(value, timeZone) {
  if (!value) return 'Session time unavailable';
  const raw = String(value);
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(+date)) return 'Session time unavailable';
  try { return new Intl.DateTimeFormat(undefined, { timeZone: timeZone || 'America/Denver', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date); }
  catch { return date.toLocaleString(); }
}
export function sessionCommentsQuery(appointmentId, clientId) {
  return { secureCommentAppointmentId: String(appointmentId), ...(clientId ? { secureCommentClientId: String(clientId) } : {}) };
}
export function activeTodayAppointments(data, now = Date.now()) {
  const rows = data?.appointments || [];
  const lastEnd = data?.lastSessionEndAt || rows.filter(a => !['canceled', 'cancelled', 'voided', 'deleted', 'completed', 'no_show'].includes(String(a.status).toLowerCase())).map(a => a.endAt).sort().at(-1);
  if (data?.dayFinished || !lastEnd || +new Date(lastEnd) <= now) return [];
  return rows.filter(a => Number(a.unreadCount) > 0 && !['canceled', 'cancelled', 'voided', 'deleted'].includes(String(a.status).toLowerCase()));
}
let pending = new Map(), scheduled = false;
const transports = new WeakMap(); let transportId = 0;
// All visible appointment icons share a batched metadata request. No comment body
// is fetched until an authorized thread or today's authenticated view is opened.
export function requestCommentBadge(appointmentId, clientId, requestApi = api) {
  const id = Number(appointmentId); if (!id || !secureCommentState.enabled) return;
  if (!transports.has(requestApi)) transports.set(requestApi, ++transportId);
  const scopeKey = secureCommentState.scopeKey;
  const transport = transports.get(requestApi);
  pending.set(`${transport}:${scopeKey}:${id}:${Number(clientId) || 0}`, { id, clientId: Number(clientId) || null, requestApi, scopeKey, transport });
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    const batch = [...pending.values()]; pending = new Map(); scheduled = false;
    const revision = secureCommentState.revision, groups = new Map();
    for (const row of batch) { const key = `${row.transport}:${row.scopeKey}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
    const chunks = [...groups.values()].flatMap(group => { const result = []; for (let offset = 0; offset < group.length; offset += 100) result.push(group.slice(offset, offset + 100)); return result; });
    await Promise.allSettled(chunks.map(async group => {
      if (group[0].scopeKey !== secureCommentState.scopeKey) return;
      const { data } = await group[0].requestApi.get(`${commentRoot}/badges`, { params: { appointmentIds: [...new Set(group.map(a => a.id))].join(',') }, skipGlobalLoading: true });
      if (revision !== secureCommentState.revision || group[0].scopeKey !== secureCommentState.scopeKey) return;
      for (const a of group) {
        const rows = (data.appointments || []).filter(row => Number(row.appointmentId) === a.id && (!a.clientId || Number(row.clientId) === a.clientId));
        secureCommentState.badges[`${a.id}:${a.clientId || 0}`] = rows.reduce((sum, row) => ({ count: sum.count + Number(row.count || 0), unreadCount: sum.unreadCount + Number(row.unreadCount || 0) }), { count: 0, unreadCount: 0 });
      }
    }));
  });
}
