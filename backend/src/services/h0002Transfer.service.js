import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { screeningReviewContext, screeningDate } from './h0002ScreeningWorkflow.service.js';
import { resolveServiceSupervisor } from './serviceBillingSupervisor.service.js';
const fail = message => Object.assign(new Error(message), { status: 409 });
export function speaksSpanish(value) {
  return /\bspanish\b|español|espanol|(?:^|[\s,;"\[])es(?:$|[\s,;"\]])/i.test(typeof value === 'string' ? value : JSON.stringify(value || []));
}
export async function screeningTransferOptions(context) {
  const { session, source } = context;
  if (source.sourceLanguage !== 'es') return { providers: [], supervisor: null };
  const scope = { agencyId: session.agency_id, serviceCode: 'H0002', dateOfService: screeningDate() };
  const supervisor = await resolveServiceSupervisor({ ...scope, providerUserId: session.provider_user_id });
  if (!supervisor) return { providers: [], supervisor: null };
  const [users] = await pool.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.languages_spoken,u.credential FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.id<>? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND u.status IN ('ACTIVE','ACTIVE_EMPLOYEE','EHR_ONLY')
      AND u.role IN ('provider','provider_plus','admin','super_admin','supervisor','intern','intern_plus')`, [session.agency_id, session.provider_user_id]);
  const providers = [];
  for (const user of users.filter(u => speaksSpanish(u.languages_spoken) && u.credential)) {
    const rule = await resolveServiceSupervisor({ ...scope, providerUserId: user.id });
    if (rule?.supervisorUserId === supervisor.supervisorUserId) providers.push({ id: Number(user.id), name: [user.first_name,user.last_name].filter(Boolean).join(' ') });
  }
  return { providers, supervisor: { id: supervisor.supervisorUserId, name: supervisor.supervisorName } };
}
export async function transferScreening({ sessionId, user, providerUserId }) {
  const db = await clinicalPool.getConnection();
  const key = `h0002:sign:${Number(sessionId)}`;
  let acquired = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?, 5) AS acquired', [key]);
    acquired = Number(lock.acquired) === 1;
    if (!acquired) throw fail('The screening is being updated. Please retry.');
    const context = await screeningReviewContext({ sessionId, user });
    if (context.note.provider_signed_at) throw fail('A signed screening cannot be reassigned.');
    const options = await screeningTransferOptions(context);
    if (!options.providers.some(p => p.id === Number(providerUserId))) throw fail('Choose an eligible Spanish-speaking provider with the same billing supervisor.');
    // A single transaction keeps the note, session, task and queue in sync.
    const [[main]] = await pool.execute('SELECT DATABASE() AS schemaName, @@server_uuid AS serverId');
    const [[clinical]] = await db.execute('SELECT @@server_uuid AS serverId');
    if (main.serverId !== clinical.serverId || !/^[a-zA-Z0-9_]+$/.test(main.schemaName)) throw fail('Atomic screening reassignment is unavailable on this database configuration.');
    const app = `\`${main.schemaName}\``;
    await db.beginTransaction();
    const [[lockedNote]] = await db.execute('SELECT provider_signed_at,created_by_user_id FROM clinical_notes WHERE id=? FOR UPDATE', [context.note.id]);
    if (lockedNote.provider_signed_at || Number(lockedNote.created_by_user_id) !== Number(user.id)) throw fail('This screening changed. Reopen it before forwarding.');
    const [claims] = await db.execute('SELECT id FROM clinical_claims WHERE clinical_session_id=? LIMIT 1', [sessionId]);
    if (claims.length) throw fail('This encounter already has a claim. Billing must review reassignment.');
    const [task] = await db.execute(`UPDATE ${app}.tasks SET assigned_to_user_id=? WHERE id=? AND assigned_to_user_id=?`, [providerUserId,context.source.task.id,user.id]);
    if (!task.affectedRows) throw fail('Screening assignment changed.');
    await db.execute('UPDATE clinical_sessions SET provider_user_id=?,rendering_provider_user_id=? WHERE id=?', [providerUserId,providerUserId,sessionId]);
    await db.execute(`UPDATE clinical_notes SET created_by_user_id=?,metadata_json=JSON_SET(COALESCE(metadata_json,JSON_OBJECT()),'$.screeningTransfer',CAST(? AS JSON)) WHERE id=?`,
      [providerUserId,JSON.stringify({ fromUserId:Number(user.id),toUserId:Number(providerUserId),at:new Date().toISOString(),supervisorUserId:options.supervisor.id }),context.note.id]);
    await db.execute(`UPDATE ${app}.note_aid_work_queue_items SET user_id=? WHERE user_id=? AND client_key=?`, [providerUserId,user.id,`h0002_task_${context.source.task.id}`]);
    await db.commit();
    return { ok: true, providerUserId: Number(providerUserId), supervisor: options.supervisor };
  } catch (error) { await db.rollback(); throw error; }
  finally { if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [key]); db.release(); }
}
