import { wallMysqlToUtcMysql, utcMysqlToIso } from './zonedWallTime.util.js';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function normalizeSchoolVisitRequest(body = {}) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const kind = String(body.kind || 'reschedule');
  const note = String(body.note || '').trim();
  if (!name || name.length > 150) fail('Please enter your name.');
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) || email.length > 254) fail('Please enter your contact email.');
  if (!['reschedule', 'virtual', 'cancel', 'other'].includes(kind)) fail('Select a change type.');
  if (!note || note.length > 2000) fail('Please describe the requested change (up to 2,000 characters).');
  return { name, email, kind, note };
}

export function normalizeSchoolVisitUpdate(body = {}, now = new Date()) {
  if (body.action === 'cancel') return { action: 'cancel' };
  if (body.action !== 'update') fail('Select update or cancel.');
  if (!['virtual', 'in_person'].includes(body.modality)) fail('Select virtual or in person.');
  const parse = value => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value || ''))) fail('Enter the date and time in Mountain time.');
    const mysql = wallMysqlToUtcMysql(String(value).replace('T', ' ') + ':00', 'America/Denver');
    if (!mysql) fail('Invalid date or time.');
    return mysql;
  };
  const startsAt = parse(body.startsAt), endsAt = parse(body.endsAt);
  const start = new Date(utcMysqlToIso(startsAt)), end = new Date(utcMysqlToIso(endsAt));
  if (start <= now || end <= start || end - start > 4 * 60 * 60 * 1000) fail('Choose a future visit with an end time after its start (maximum four hours).');
  const location = String(body.location || '').trim();
  if (body.modality === 'in_person' && (!location || location.length > 500)) fail('Enter the in-person meeting location.');
  return { action: 'update', startsAt, endsAt, modality: body.modality, location: body.modality === 'in_person' ? location : '' };
}
