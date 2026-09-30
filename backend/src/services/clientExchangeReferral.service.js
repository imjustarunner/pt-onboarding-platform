import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { generateUniqueSixDigitClientCode } from '../utils/clientCode.js';
import { normalizeExchangeSchedule } from '../utils/clientExchangeSchedule.js';
import { notifyTaskAddedToList } from './taskNotifications.service.js';
const invalid = message => Object.assign(new Error(message), { status: 400 });
export function validateExchangeReferral(input) {
  const initials = String(input.initials || '').trim();
  if (!/^[\p{L} .'-]{2,10}$/u.test(initials)) throw invalid('Enter client initials (2–10 characters)');
  const age = input.age === '' || input.age == null ? null : Number(input.age);
  if (age != null && (!Number.isInteger(age) || age < 0 || age > 120)) throw invalid('Enter a valid age');
  const text = (key, max) => { const value = String(input[key] || '').trim(); if (value.length > max) throw invalid(`${key} is too long`); return value; };
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId || '')) throw invalid('A referral request ID is required');
  const providerGender = text('providerGender', 40);
  if (!['', 'female', 'male', 'nonbinary'].includes(providerGender)) throw invalid('Select a valid provider gender preference');
  const modality = text('modality', 20);
  if (!['', 'in_person', 'virtual', 'either'].includes(modality)) throw invalid('Select a valid modality');
  return { initials, age, fullName: text('fullName', 200), gender: text('gender', 64), diagnoses: text('diagnoses', 2000), presentingProblem: text('presentingProblem', 4000), providerGender, modality, ehrReference: text('ehrReference', 200), schedule: normalizeExchangeSchedule(input.schedule || {}), requestId: input.requestId };
}
/** Create the minimum chart and a shared support follow-up together. Retried requests reuse both. */
export async function createExchangeReferral({ agencyId, actor, input }) {
  const data = validateExchangeReferral(input);
  const connection = await pool.getConnection();
  let result;
  try {
    await connection.beginTransaction();
    const [agencies] = await connection.execute('SELECT id FROM agencies WHERE id = ? FOR UPDATE', [agencyId]);
    if (!agencies.length) throw invalid('Agency not found');
    const [existing] = await connection.execute(`SELECT id FROM clients WHERE agency_id = ? AND created_by_user_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(intake_preferences_json, '$.exchangeReferral.requestId')) = ? LIMIT 1`, [agencyId, actor.id, data.requestId]);
    if (existing.length) { await connection.commit(); return { clientId: existing[0].id, reused: true }; }
    const [members] = await connection.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id = u.id
      WHERE ua.agency_id = ? AND u.role IN ('support', 'admin', 'staff', 'super_admin')
      AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0
      AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'PROSPECTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED_PENDING') ORDER BY u.id`, [agencyId]);
    if (!members.length) throw invalid('No support or admin team is available for this agency');
    const listName = 'Client Exchange — Support follow-up';
    const [lists] = await connection.execute('SELECT id FROM task_lists WHERE agency_id = ? AND name = ? LIMIT 1', [agencyId, listName]);
    let listId = lists[0]?.id;
    if (!listId) {
      const [list] = await connection.execute('INSERT INTO task_lists (agency_id, name, created_by_user_id) VALUES (?, ?, ?)', [agencyId, listName, members[0].id]);
      listId = list.insertId;
    }
    for (const member of members) await connection.execute("INSERT INTO task_list_members (task_list_id, user_id, role) VALUES (?, ?, 'editor') ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)", [listId, member.id]);
    await connection.execute(`DELETE FROM task_list_members WHERE task_list_id = ? AND user_id NOT IN (${members.map(() => '?').join(',')})`, [listId, ...members.map(member => member.id)]);
    const isStaff = ['admin', 'support', 'staff', 'super_admin'].includes(actor.role);
    const client = await Client.create({ agency_id: agencyId, organization_id: agencyId,
      provider_id: isStaff ? null : actor.id, initials: data.initials, full_name: data.fullName || null,
      gender: data.gender || null, identifier_code: await generateUniqueSixDigitClientCode({ agencyId }),
      client_type: 'clinical', source: 'ADMIN_CREATED', status: 'PENDING_REVIEW',
      submission_date: new Date().toISOString().slice(0, 10), created_by_user_id: actor.id }, { executor: connection, hydrate: false });
    const preferences = { exchangeReferral: data, exchangeSchedule: data.schedule, preferredModality: data.modality || null, preferredProviderGender: data.providerGender || null };
    await connection.execute('UPDATE clients SET intake_preferences_json = ? WHERE id = ?', [JSON.stringify(preferences), client.id]);
    await connection.execute('INSERT INTO client_agency_assignments (client_id, agency_id, is_primary, is_active) VALUES (?, ?, TRUE, TRUE)', [client.id, agencyId]);
    const metadata = { source: 'client_exchange_setup', clientId: client.id, agencyId, subtasks: [
      { id: 'ehr', title: 'Locate and check the existing EHR record; check for duplicate clients', done: false },
      { id: 'demographics', title: 'Complete and verify demographics', done: false },
      { id: 'clinical', title: 'Import or review the intake and latest treatment plan', done: false },
      { id: 'referral', title: 'Review referral details and provider requests', done: false }
    ] };
    const [task] = await connection.execute(`INSERT INTO tasks (task_type, title, description, assigned_by_user_id, task_list_id, urgency, source_ref_type, source_ref_id, metadata)
      VALUES ('custom', 'Complete client record for exchange referral', 'Claim this shared task, then open the linked client to complete the record from the EHR. Review any records already pasted by the referring provider.', ?, ?, 'high', 'client_exchange_setup', ?, ?)`, [actor.id, listId, String(client.id), JSON.stringify(metadata)]);
    await connection.execute("INSERT INTO task_audit_log (task_id, action_type, actor_user_id, metadata) VALUES (?, 'assigned', ?, ?)", [task.insertId, actor.id, JSON.stringify({ source: 'client_exchange_setup', clientId: client.id })]);
    await connection.commit();
    result = { clientId: client.id, taskId: task.insertId, listId, listName };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  await notifyTaskAddedToList({ listId: result.listId, listName: result.listName, task: { id: result.taskId, title: 'Complete client record for exchange referral' }, actorUserId: actor.id, agencyId }).catch(() => {});
  return result;
}
