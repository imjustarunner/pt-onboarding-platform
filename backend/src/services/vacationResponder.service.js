import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import PlannedOut, { isPlannedOutActiveNow, ymdFromStoredDate } from '../models/PlannedOut.model.js';
import { utcMysqlToIso, wallMysqlToUtcMysql, isValidTimeZone, dateToMysqlUtcDateTime } from '../utils/zonedWallTime.util.js';
import { vacationTemplates, validateVacationTemplate, TEMPLATE_KEYS, responderState } from './vacationResponderPolicy.js';
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export async function vacationDefaults(agency) {
  const [rows] = await pool.execute('SELECT * FROM agency_vacation_templates WHERE agency_id = ?', [agency.id]);
  const row = rows[0];
  const custom = typeof row?.templates_json === 'string' ? JSON.parse(row.templates_json) : row?.templates_json || {};
  const slug = String(agency.slug || '').toLowerCase();
  const contact = slug === 'itsco' ? 'support@itsco.health' : ['nlu', 'nextlevelup'].includes(slug) ? 'support@nextleveluplcc.com' : ['tisi', 'isi'].includes(slug) ? 'support@innerstrengthin.com' : slug === 'plottwistco' ? 'support@plottwistco.com' : 'your agency’s support team through the app';
  return { templates: { ...vacationTemplates(), ...custom }, supportContact: row?.support_contact || contact };
}
export async function saveVacationDefaults(agency, userId, input) {
  const templates = {};
  for (const key of TEMPLATE_KEYS) templates[key] = validateVacationTemplate(input.templates?.[key]);
  const support = String(input.supportContact || '').trim();
  if (!support || support.length > 320 || /[\r\n<>]/.test(support)) fail('Enter a support email or contact instruction (up to 320 characters).');
  await pool.execute(`INSERT INTO agency_vacation_templates (agency_id, templates_json, support_contact, updated_by_user_id)
    VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE templates_json = VALUES(templates_json), support_contact = VALUES(support_contact), updated_by_user_id = VALUES(updated_by_user_id)`, [agency.id, JSON.stringify(templates), support, userId]);
}
export async function getVacationConfig(agencyId, userId) {
  const [rows] = await pool.execute('SELECT * FROM user_email_vacation_responders WHERE agency_id = ? AND user_id = ?', [agencyId, userId]);
  const r = rows[0];
  return { enabled: !!r?.enabled, plannedOutId: r?.planned_out_id || null, endsAt: utcMysqlToIso(r?.ends_at), timeZone: r?.time_zone || 'America/Denver', templateKey: r?.template_key || 'provider_colorado_springs', messageTemplate: r?.message_template || '' };
}
export async function ownPlannedOuts(agencyId, userId) {
  const [rows] = await pool.execute(`SELECT id FROM planned_outs WHERE agency_id = ? AND user_id = ? AND status IN ('pending','approved') AND (end_at > UTC_TIMESTAMP() OR end_date >= DATE(UTC_TIMESTAMP())) ORDER BY id DESC LIMIT 100`, [agencyId, userId]);
  return Promise.all(rows.map(async r => {
    const po = await PlannedOut.findById(r.id);
    return { id: po.id, status: po.status, start: po.all_day ? ymdFromStoredDate(po.start_date) : utcMysqlToIso(po.start_at), end: po.all_day ? ymdFromStoredDate(po.end_date) : utcMysqlToIso(po.end_at), allDay: po.all_day };
  }));
}
export async function activePlannedOut(agencyId, userId, id, now = new Date()) {
  if (!id) return null;
  const po = await PlannedOut.findById(id);
  return po && Number(po.agency_id) === Number(agencyId) && Number(po.user_id) === Number(userId) && po.availability === 'unavailable' && isPlannedOutActiveNow(po, now, po.time_zone || 'America/Denver') ? po : null;
}
export async function saveVacationConfig(agencyId, userId, input, now = new Date()) {
  if (typeof input.enabled !== 'boolean') fail('Choose whether the responder is on or off.');
  // Turning off must work even if the selected absence was removed or its dates expired.
  if (!input.enabled) {
    await pool.execute('UPDATE user_email_vacation_responders SET enabled = 0 WHERE agency_id = ? AND user_id = ?', [agencyId, userId]);
    return;
  }
  if (!TEMPLATE_KEYS.includes(input.templateKey)) fail('Choose a provider or staff template and location.');
  if (!isValidTimeZone(input.timeZone)) fail('Choose a valid time zone.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(input.endsLocal || ''))) fail('Set the return date and time that turns the responder off.');
  const end = wallMysqlToUtcMysql(input.endsLocal.replace('T', ' ') + ':00', input.timeZone);
  if (!end || new Date(utcMysqlToIso(end)) <= now) fail('The return time must be in the future.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utcMysqlToIso(end))).map(p => [p.type, p.value]));
  if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` !== input.endsLocal) fail('That local date/time does not exist. Choose another return time.');
  const po = await PlannedOut.findById(Number(input.plannedOutId));
  if (!po || Number(po.agency_id) !== Number(agencyId) || Number(po.user_id) !== Number(userId) || !['pending', 'approved'].includes(po.status) || po.availability !== 'unavailable') fail('Select your own pending or approved unavailable planned out.');
  const zone = po.time_zone || 'America/Denver';
  const start = po.all_day ? utcMysqlToIso(wallMysqlToUtcMysql(`${ymdFromStoredDate(po.start_date)} 00:00:00`, zone)) : utcMysqlToIso(po.start_at);
  const stop = po.all_day ? utcMysqlToIso(wallMysqlToUtcMysql(`${ymdFromStoredDate(po.end_date)} 00:00:00`, zone)) : utcMysqlToIso(po.end_at);
  if (!start || !stop || new Date(stop) <= now) fail('Choose an upcoming or current planned out.');
  if (new Date(utcMysqlToIso(end)) <= new Date(start)) fail('The responder end must be after the planned out begins.');
  const template = input.messageTemplate ? validateVacationTemplate(input.messageTemplate) : null;
  await pool.execute(`INSERT INTO user_email_vacation_responders (agency_id,user_id,enabled,planned_out_id,ends_at,time_zone,template_key,message_template)
    VALUES (?,?,1,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=1,planned_out_id=VALUES(planned_out_id),ends_at=VALUES(ends_at),time_zone=VALUES(time_zone),template_key=VALUES(template_key),message_template=VALUES(message_template)`,
  [agencyId,userId,po.id,end,input.timeZone,input.templateKey,template]);
}
export async function resolveVacation(agencyId, userId, now = new Date()) {
  const config = await getVacationConfig(agencyId, userId);
  const active = await activePlannedOut(agencyId, userId, config.plannedOutId, now);
  let state = responderState(config, !!active, now);
  if (state === 'waiting') {
    const po = config.plannedOutId ? await PlannedOut.findById(config.plannedOutId) : null;
    const stop = po?.all_day ? utcMysqlToIso(wallMysqlToUtcMysql(`${ymdFromStoredDate(po.end_date)} 00:00:00`, po.time_zone || 'America/Denver')) : utcMysqlToIso(po?.end_at);
    if (!po || Number(po.agency_id) !== Number(agencyId) || Number(po.user_id) !== Number(userId) || !['pending','approved'].includes(po.status) || po.availability !== 'unavailable' || !stop || new Date(stop) <= now) state = 'inactive';
  }
  return { ...config, state };
}
export async function claimVacationReply(agencyId, userId, recipient, now = new Date()) {
  const hash = createHash('sha256').update(String(recipient).trim().toLowerCase()).digest('hex');
  const at = dateToMysqlUtcDateTime(now);
  const [insert] = await pool.execute('INSERT IGNORE INTO email_vacation_reply_claims (agency_id,user_id,recipient_hash,claimed_at) VALUES (?,?,?,?)', [agencyId,userId,hash,at]);
  if (insert.affectedRows === 1) return { hash, at };
  const [update] = await pool.execute('UPDATE email_vacation_reply_claims SET claimed_at = ? WHERE agency_id = ? AND user_id = ? AND recipient_hash = ? AND claimed_at <= DATE_SUB(?, INTERVAL 24 HOUR)', [at,agencyId,userId,hash,at]);
  return update.affectedRows === 1 ? { hash, at } : null;
}
export async function releaseVacationReply(agencyId, userId, claim) {
  await pool.execute('DELETE FROM email_vacation_reply_claims WHERE agency_id = ? AND user_id = ? AND recipient_hash = ? AND claimed_at = ?', [agencyId,userId,claim.hash,claim.at]);
}
export async function currentPlannedOut(agencyId, userId, now = new Date()) {
  const [rows] = await pool.execute("SELECT id FROM planned_outs WHERE agency_id = ? AND user_id = ? AND status = 'approved' AND availability = 'unavailable' AND (end_at > UTC_TIMESTAMP() OR end_date >= DATE(UTC_TIMESTAMP())) ORDER BY id DESC LIMIT 100", [agencyId, userId]);
  for (const row of rows) {
    const active = await activePlannedOut(agencyId, userId, row.id, now);
    if (active) return active;
  }
  return null;
}
