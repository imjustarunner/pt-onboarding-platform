import { normalizeRecipe } from './familyRecipePolicy.js';
export const FAMILY_KINDS = ['event', 'status', 'chore', 'grocery', 'shopping', 'packing', 'meal', 'announcement', 'reward'];
export const FAMILY_STATUSES = ["Home", "Away", "Sleeping", "Awake", "Getting Ready", "School", "Work", "Working From Home", "Daycare", "At Practice", "At Game", "At Activity", "At Appointment", "Driving", "On the Way", "Pickup", "Drop-Off", "Traveling", "Vacation", "With Family", "With Friends", "Babysitter", "Sick", "Resting", "Busy", "Do Not Disturb", "Running Late", "Available", "Expected Home", "Unknown / No Status", "Working", "Practice", "Appointment", "Shopping", "Unknown"];
export function familyError(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function json(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value) || fallback; } catch { return fallback; }
}
export function familyEnabled(flags) { const f = json(flags); return f.familyCommandCenterEnabled === true || f.familyCommandCenterEnabled === 1; }
export function safePhoto(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (s.length <= 700000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  if (s.length < 2048 && /^https:\/\//.test(s)) return s;
  throw familyError('Choose a JPG, PNG or WebP photo smaller than 500 KB, or an HTTPS image URL.');
}
export function validateEntry(body) {
  const kind = String(body.kind || '');
  const title = String(body.title || '').trim();
  if (!FAMILY_KINDS.includes(kind) || !title || title.length > 200) throw familyError('Choose an entry type and a title (up to 200 characters).');
  const start = body.startAt ? new Date(body.startAt) : null;
  const end = body.endAt ? new Date(body.endAt) : null;
  if ((start && !Number.isFinite(+start)) || (end && !Number.isFinite(+end))) throw familyError('Enter valid dates.');
  if (['event', 'status'].includes(kind) && (!start || !end || end <= start)) throw familyError('End time must be after start time.');
  if (kind === 'status' && !FAMILY_STATUSES.includes(title)) throw familyError('Choose a family status.');
  const m = body.metadata || {};
  const points = Number(m.points ?? 0);
  if (!Number.isInteger(points) || points < 0 || points > 100000) throw familyError('Points must be a whole number between 0 and 100,000.');
  if (kind === 'reward' && points < 1) throw familyError('Rewards must cost at least one point.');
  const metadata = {
    ...(kind === 'meal' && m.recipe ? { recipe: normalizeRecipe(m.recipe) } : {}),
    eventType: String(m.eventType || 'family').slice(0, 40),
    autoTheme: m.autoTheme === true || !m.eventType,
    allDay: m.allDay === true,
    color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#6667d9',
    artwork: safePhoto(m.artwork),
    artworkVariant: typeof m.artworkVariant === 'string' && /^[a-z0-9-]{1,80}$/.test(m.artworkVariant) ? m.artworkVariant : null,
    points,
    approval: m.approval !== false,
    recurrence: ['daily', 'weekly'].includes(m.recurrence) ? m.recurrence : 'none',
    category: String(m.category || '').slice(0, 80),
    address: String(m.address || '').slice(0, 500),
    contact: String(m.contact || '').slice(0, 300),
    notes: String(m.notes || '').slice(0, 4000),
    equipment: String(m.equipment || '').slice(0, 2000),
    pickup: String(m.pickup || '').slice(0, 100),
    dropoff: String(m.dropoff || '').slice(0, 100),
    reminderMinutes: Math.max(0, Math.min(10080, Number(m.reminderMinutes) || 0)),
    rotation: Array.isArray(m.rotation) ? [...new Set(m.rotation.map(Number))].slice(0, 30) : []
  };
  return { kind, title, start, end, metadata, memberId: Number(body.memberUserId) || null };
}
export function localDay(now, timezone) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function occurrenceKey(entry, timezone, now = new Date()) {
  const recurrence = json(entry.metadata).recurrence;
  if (!['daily', 'weekly'].includes(recurrence)) return 'once';
  const day = localDay(now, timezone);
  if (recurrence === 'daily') return day;
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function assignedMember(entry, timezone, now = new Date()) {
  const metadata = json(entry.metadata);
  const rotation = metadata.rotation || [];
  if (!rotation.length) return entry.member_user_id;
  if (metadata.recurrence === 'none' || !metadata.recurrence) return rotation[0];
  if (metadata.recurrence === 'weekly') {
    const week = new Date(`${occurrenceKey(entry, timezone, now)}T00:00:00Z`);
    const firstWeek = new Date(`${occurrenceKey(entry, timezone, new Date(entry.created_at))}T00:00:00Z`);
    return rotation[Math.max(0, Math.floor((week-firstWeek)/(7*86400000))) % rotation.length];
  }
  const day = new Date(`${localDay(now, timezone)}T00:00:00Z`);
  const origin = new Date(`${localDay(new Date(entry.created_at), timezone)}T00:00:00Z`);
  const days = Math.max(0, Math.floor((day - origin) / 86400000));
  return rotation[days % rotation.length];
}
