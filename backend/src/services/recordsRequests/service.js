import crypto from 'node:crypto';
import { publicBrand } from './branding.js';
import pool from '../../config/database.js';
import { encryptFamilyBilling as seal, decryptFamilyBilling as open, assertFamilyBillingEncryption } from '../familyBillingEncryption.service.js';
import { fail, requestFields, transitionRequest, finished, managerIds } from './policy.js';

const activeUser = "COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE')";
export async function transaction(fn) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const value = await fn(db); await db.commit(); return value; }
  catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
const aad = row => `auricwell:records:${row.agency_id}:${row.id}`;
const decode = row => ({ id: row.id, createdAt: row.created_at, revision: row.revision, data: { ...open(row.payload, aad(row)), status: row.status, assignedAccountId: row.assigned_user_id, supportTicketId: row.support_ticket_id, followUpAt: row.follow_up_at, unassigned: !row.assigned_user_id, overdue: !finished(row.status) && new Date(row.follow_up_at).getTime() <= Date.now() } });
async function audit(db, agencyId, userId, action, id = null, details = {}) {
  await db.execute('INSERT INTO auricwell_records_audit (agency_id,request_id,actor_user_id,action,details) VALUES (?,?,?,?,?)', [agencyId, id, userId || null, action, seal(details, `auricwell:records-audit:${agencyId}`)]);
}
export async function practice(id, db = pool) {
  const [[row]] = await db.execute("SELECT a.id,a.name,a.slug,COALESCE(s.enabled,0) enabled,COALESCE(s.follow_up_days,7) followUpDays,COALESCE(s.revision,0) revision FROM agencies a LEFT JOIN auricwell_records_settings s ON s.agency_id=a.id WHERE a.id=? AND a.is_active=1 AND COALESCE(a.organization_type,'agency') IN ('agency','clinical')", [id]);
  if (!row) throw fail(404, 'Practice unavailable.');
  return row;
}
export async function managers(agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT u.id,CONCAT_WS(' ',u.first_name,u.last_name) name,m.assignment_order FROM auricwell_records_managers m JOIN users u ON u.id=m.user_id WHERE m.agency_id=? AND ${activeUser} ORDER BY m.assignment_order`, [agencyId]);
  return rows;
}
export async function requireManager(userId, agencyId, db = pool) {
  if (!(await managers(agencyId, db)).some(m => m.id === Number(userId))) throw fail(403, 'Records Manager access is required for this practice.');
}
export async function requireAdministrator(userId, agencyId, db = pool) {
  const [[row]] = await db.execute(`SELECT u.id FROM users u WHERE u.id=? AND ${activeUser} AND
    (u.role='super_admin' OR (u.role IN ('admin','agency_admin','backoffice_admin') AND EXISTS
      (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1)))`, [userId, agencyId]);
  if (!row) throw fail(403, 'Practice administrator access is required.');
}
export async function publicPractices() {
  const [rows] = await pool.execute("SELECT a.id,a.slug,a.name,a.logo_url,a.logo_path,a.color_palette FROM agencies a JOIN auricwell_records_settings s ON s.agency_id=a.id AND s.enabled=1 WHERE a.is_active=1 ORDER BY a.name");
  return rows.map(publicBrand);
}
export async function context(userId) {
  const [rows] = await pool.execute(`SELECT a.id,a.slug,a.name,
    EXISTS(SELECT 1 FROM auricwell_records_managers m WHERE m.agency_id=a.id AND m.user_id=u.id) canManage,
    (u.role='super_admin' OR (u.role IN ('admin','agency_admin','backoffice_admin') AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=a.id AND COALESCE(ua.is_active,1)=1))) canConfigure
    FROM agencies a JOIN users u ON u.id=? WHERE a.is_active=1 AND COALESCE(a.organization_type,'agency') IN ('agency','clinical') AND ${activeUser}
    HAVING canManage=1 OR canConfigure=1 ORDER BY a.name`, [userId]);
  return { practices: rows };
}
export async function options(userId, agencyId) {
  const p = await practice(agencyId);
  let canConfigure = false;
  try { await requireAdministrator(userId, agencyId); canConfigure = true; } catch (e) { if (e.status !== 403) throw e; }
  if (!canConfigure) await requireManager(userId, agencyId);
  const list = await managers(agencyId);
  const result = { managers: list, canConfigure, settings: { enabled: !!p.enabled, followUpDays: p.followUpDays, managerIds: list.map(m => m.id), revision: p.revision } };
  if (canConfigure) {
    const [candidates] = await pool.execute(`SELECT DISTINCT u.id,CONCAT_WS(' ',u.first_name,u.last_name) name FROM users u WHERE ${activeUser} AND u.role IN ('super_admin','admin','agency_admin','support','staff','clinical_practice_assistant','backoffice_admin')
      AND (u.role='super_admin' OR EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1) OR EXISTS(SELECT 1 FROM auricwell_records_managers m WHERE m.user_id=u.id AND m.agency_id=?)) ORDER BY name`, [agencyId, agencyId]);
    result.candidates = candidates;
    const [[counts]] = await pool.execute("SELECT COUNT(*) unassigned FROM auricwell_record_requests r WHERE agency_id=? AND status NOT IN ('closed','fulfilled') AND (assigned_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM auricwell_records_managers m JOIN users u ON u.id=m.user_id WHERE m.agency_id=r.agency_id AND m.user_id=r.assigned_user_id AND " + activeUser + '))', [agencyId]);
    result.unassignedCount = counts.unassigned;
  }
  return result;
}
export async function saveOptions(userId, agencyId, input) {
  await requireAdministrator(userId, agencyId);
  const ids = managerIds(input);
  const available = (await options(userId, agencyId)).candidates;
  if (ids.some(id => !available.some(c => c.id === id))) throw fail(400, 'Choose active staff from this practice.');
  return transaction(async db => {
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
    const p = await practice(agencyId, db);
    if (Number(input.revision) !== p.revision) throw fail(409, 'Settings changed. Refresh before saving.');
    await db.execute('INSERT INTO auricwell_records_settings (agency_id,enabled,follow_up_days,revision) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),follow_up_days=VALUES(follow_up_days),revision=revision+1', [agencyId, input.enabled === true ? 1 : 0, input.followUpDays]);
    await db.execute('DELETE FROM auricwell_records_managers WHERE agency_id=?', [agencyId]);
    for (let i=0;i<ids.length;i++) await db.execute('INSERT INTO auricwell_records_managers (agency_id,user_id,assignment_order) VALUES (?,?,?)', [agencyId, ids[i], i]);
    await audit(db, agencyId, userId, 'managers_configured', null, { managerIds: ids, enabled: input.enabled === true, followUpDays: input.followUpDays });
    return { saved: true };
  });
}
export async function portalPatients(userId, agencyId) {
  await practice(agencyId);
  const [rows] = await pool.execute(`SELECT c.id,c.full_name FROM clients c JOIN client_guardians cg ON cg.client_id=c.id WHERE cg.guardian_user_id=? AND cg.access_enabled=1 AND c.agency_id=?`, [userId, agencyId]);
  return rows.map(r => ({ id: r.id, data: { name: r.full_name } }));
}
export async function submit(agencyId, input, userId = null) {
  assertFamilyBillingEncryption();
  const p = await practice(agencyId);
  if (!p.enabled) throw fail(404, 'Online requests are unavailable. Please contact your practice.');
  let clientId = null;
  const data = requestFields(input);
  if (userId !== null) {
    const patient = (await portalPatients(userId, agencyId)).find(c => c.id === Number(input.patientId));
    if (!patient) throw fail(403, 'An active patient or guardian link is required.');
    clientId = patient.id;
    data.patientName = patient.data.name;
    data.identityMethod = 'authenticated_portal';
  }
  data.source = userId ? 'portal' : 'website';
  const id = crypto.randomUUID();
  const record = { id, agency_id: agencyId };
  await transaction(async db => {
    const staff = await managers(agencyId, db);
    await db.execute(`INSERT INTO auricwell_record_requests (id,agency_id,requester_user_id,client_id,assigned_user_id,status,payload,follow_up_at) VALUES (?,?,?,?,?,?,?,?)`, [id, agencyId, userId, clientId, staff[0]?.id || null, userId ? 'pending_review' : 'pending_verification', seal(data, aad(record)), new Date(Date.now()+p.followUpDays*86400000)]);
    await audit(db, agencyId, userId, 'request_created', id, { source: data.source });
  });
  await trySync(id);
  return { message: 'Your request was received. The practice will verify identity and authority before releasing records. This does not confirm that a patient record exists.' };
}
export async function requests(userId, agencyId, portal = false) {
  await practice(agencyId);
  if (!portal) await requireManager(userId, agencyId);
  const [rows] = await pool.execute(`SELECT r.* FROM auricwell_record_requests r WHERE r.agency_id=? ${portal ? 'AND r.requester_user_id=? AND EXISTS(SELECT 1 FROM client_guardians cg WHERE cg.client_id=r.client_id AND cg.guardian_user_id=r.requester_user_id AND cg.access_enabled=1)' : ''} ORDER BY r.created_at DESC LIMIT 1000`, portal ? [agencyId,userId] : [agencyId]);
  await audit(pool, agencyId, userId, 'requests_viewed');
  const result = rows.map(decode);
  if (!portal) return result;
  return result.map(r => ({ id:r.id,createdAt:r.createdAt,data:{patientName:r.data.patientName,scope:r.data.scope,status:r.data.status,response:r.data.response||''} }));
}
async function lockedRequest(db, agencyId, id) {
  const [[r]] = await db.execute('SELECT * FROM auricwell_record_requests WHERE agency_id=? AND id=? FOR UPDATE', [agencyId,id]);
  if (!r) throw fail(404, 'Request unavailable in this practice.');
  return r;
}
export async function review(userId, agencyId, id, input) {
  await requireManager(userId, agencyId);
  await transaction(async db => {
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
    await requireManager(userId, agencyId, db);
    const r = await lockedRequest(db, agencyId, id);
    if (Number(input.revision) !== r.revision) throw fail(409, 'Request changed. Refresh before reviewing.');
    const next = transitionRequest({ ...open(r.payload,aad(r)), status:r.status }, input, userId);
    await db.execute('UPDATE auricwell_record_requests SET status=?,payload=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?', [next.status,seal(next,aad(r)),id]);
    await audit(db,agencyId,userId,'request_reviewed',id,{ status:next.status });
  });
  await trySync(id); return { saved:true };
}
export async function assign(userId, agencyId, id, input) {
  await requireManager(userId,agencyId);
  await transaction(async db => {
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[agencyId]);
    await requireManager(userId,agencyId,db);
    const r=await lockedRequest(db,agencyId,id);
    if(finished(r.status)) throw fail(409,'Completed requests cannot be reassigned.');
    if(!(await managers(agencyId,db)).some(m=>m.id===Number(input.accountId))) throw fail(400,'Choose an active Records Manager.');
    await db.execute('UPDATE auricwell_record_requests SET assigned_user_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',[Number(input.accountId),id]);
    await audit(db,agencyId,userId,'request_assigned',id,{userId:Number(input.accountId)});
  });
  await trySync(id); return {saved:true};
}
export function ticketSummary(row) {
  const complete=finished(row.status), overdue=!complete&&new Date(row.follow_up_at).getTime()<=Date.now(), unassigned=!row.assigned_user_id;
  return { subject:`AuricWell records follow-up — ${complete?'Completed':unassigned?'Unassigned':overdue?'Overdue':'Pending'}`,status:complete?'closed':'open',priority:!complete&&(unassigned||overdue)?'high':'medium',question:`Coordinate follow-up with the Records Manager. Keep patient details, identity evidence, and medical records in AuricWell.\nhttps://plottwisthq.com/records-manager?agencyId=${row.agency_id}&request=${row.id}\nClosing this support ticket does not complete the records request.` };
}
export async function sync(id) {
  await transaction(async db=>{
    const [[lookup]]=await db.execute('SELECT agency_id FROM auricwell_record_requests WHERE id=?',[id]);
    if(!lookup)return;
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[lookup.agency_id]);
    const r=await lockedRequest(db,lookup.agency_id,id);
    const staff=await managers(r.agency_id,db);
    const assignee=staff.some(m=>m.id===r.assigned_user_id)?r.assigned_user_id:staff[0]?.id||null;
    if(!finished(r.status)&&assignee!==r.assigned_user_id){r.assigned_user_id=assignee;await db.execute('UPDATE auricwell_record_requests SET assigned_user_id=?,revision=revision+1 WHERE id=?',[assignee,id]);}
    const summary=ticketSummary(r);
    const remind=!finished(r.status)&&summary.priority==='high'&&(!r.last_reminded_at||Date.now()-new Date(r.last_reminded_at).getTime()>=86400000);
    let ticket;
    if(r.support_ticket_id)[[ticket]]=await db.execute("SELECT id,status,subject,priority,claimed_by_user_id FROM support_tickets WHERE id=? AND agency_id=? AND created_by_source_key='auricwell_records_request' FOR UPDATE",[r.support_ticket_id,r.agency_id]);
    if(!ticket){
      const [result]=await db.execute(`INSERT INTO support_tickets (school_organization_id,agency_id,created_by_user_id,created_by_source_key,subject,question,status,priority,claimed_by_user_id) VALUES (?,?,NULL,'auricwell_records_request',?,?,?,?,?)`,[r.agency_id,r.agency_id,summary.subject,summary.question,summary.status,summary.priority,r.assigned_user_id]);
      await db.execute('UPDATE auricwell_record_requests SET support_ticket_id=? WHERE id=?',[result.insertId,id]);
      await audit(db,r.agency_id,null,'support_ticket_created',id,{ticketId:result.insertId});
    }else if(ticket.status!==summary.status||ticket.priority!==summary.priority||ticket.subject!==summary.subject||ticket.claimed_by_user_id!==r.assigned_user_id||remind){
      await db.execute('UPDATE support_tickets SET status=?,priority=?,subject=?,claimed_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[summary.status,summary.priority,summary.subject,r.assigned_user_id,ticket.id]);
    }
    if(remind){await db.execute('UPDATE auricwell_record_requests SET last_reminded_at=CURRENT_TIMESTAMP(3) WHERE id=?',[id]);await audit(db,r.agency_id,null,'follow_up_reminded',id);}
  });
}
export async function trySync(id){try{await sync(id);}catch(e){console.warn('[auricwell-records] Support routing queued for retry:',e.code||'sync_failed');}}
let running=false;
export async function runFollowUpTick(){if(running)return;running=true;try{let cursor='';while(true){const [rows]=await pool.execute("SELECT id FROM auricwell_record_requests WHERE id>? AND (status NOT IN ('closed','fulfilled') OR support_ticket_id IS NULL OR updated_at>DATE_SUB(NOW(),INTERVAL 1 DAY)) ORDER BY id LIMIT 200",[cursor]);if(!rows.length)break;for(const r of rows)await trySync(r.id);cursor=rows.at(-1).id;}}finally{running=false;}}
