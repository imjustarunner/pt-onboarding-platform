import pool from '../config/database.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

const SOURCE = 'provider_update';
const description = 'Your Provider Update is still unfinished. Open your personal update link, complete the remaining sections, then select Submit from the overview. This task closes automatically after your update is submitted.';
const fail = message => Object.assign(new Error(message), { status: 409 });

// The task and login reminder share the same eligibility rules. Never create
// work for previews, withdrawn staff, completed updates, or inactive memberships.
const recipientQuery = `SELECT r.*,p.title AS push_title,p.created_by_user_id,
  a.name AS agency_name,a.portal_url,a.slug,
  (r.status IN ('not_started','in_progress') AND r.finalized_at IS NULL AND r.locked_at IS NULL
   AND p.status='sent' AND p.title NOT LIKE '[PREVIEW]%'
   AND (r.expires_at IS NULL OR r.expires_at>UTC_TIMESTAMP())
   AND LEFT(r.token,8)<>'preview_' AND COALESCE(r.is_demo_snapshot,0)=0
   AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
   AND UPPER(u.status)='ACTIVE_EMPLOYEE' AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
   AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=r.agency_id AND COALESCE(ua.is_active,1)=1)) AS eligible
  FROM provider_update_recipients r
  JOIN provider_update_pushes p ON p.id=r.push_id AND p.agency_id=r.agency_id
  JOIN users u ON u.id=r.provider_user_id JOIN agencies a ON a.id=r.agency_id`;

export function providerUpdateTaskStatus(recipient) {
  if (recipient.status === 'finalized' && recipient.finalized_at && recipient.locked_at) return 'completed';
  if (!Number(recipient.eligible)) return 'overridden';
  return recipient.status === 'in_progress' ? 'in_progress' : 'pending';
}

export function createProviderUpdateTasks({ db = pool } = {}) {
  async function syncUser(userId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      // Serializes task creation for the same recipient across page loads,
      // devices, and Cloud Run instances.
      const [recipients] = await connection.execute(`${recipientQuery} WHERE r.provider_user_id=? ORDER BY r.id FOR UPDATE`, [userId]);
      const reminders = [];
      for (const recipient of recipients) {
        const [tasks] = await connection.execute('SELECT id,status FROM tasks WHERE source_ref_type=? AND source_ref_id=? FOR UPDATE', [SOURCE, String(recipient.id)]);
        const status = providerUpdateTaskStatus(recipient);
        const link = buildPublicAppUrl(recipient, `/provider-update/${encodeURIComponent(recipient.token)}`);
        let taskId = tasks[0]?.id;
        if (!taskId && Number(recipient.eligible)) {
          const metadata = { source: SOURCE, recipientId: recipient.id, pushId: recipient.push_id, managedCompletion: true };
          const [created] = await connection.execute(`INSERT INTO tasks
            (task_type,title,description,status,assigned_to_user_id,assigned_to_agency_id,assigned_by_user_id,
             source_ref_type,source_ref_id,metadata,is_required,is_private,urgency)
            VALUES ('notification',?,?,?,?,?,?,?,?,?,1,1,'high')`,
          ['Complete your Provider Update', description, status, userId, recipient.agency_id, recipient.created_by_user_id, SOURCE, String(recipient.id), JSON.stringify(metadata)]);
          taskId = created.insertId;
          await connection.execute(`INSERT INTO task_links (task_id,url,label,created_by_user_id) VALUES (?,?,?,?)`,
            [taskId, link, 'Open my Provider Update', recipient.created_by_user_id]);
          await connection.execute(`INSERT INTO task_audit_log (task_id,action_type,actor_user_id,target_user_id,metadata) VALUES (?,'assigned',?,?,?)`,
            [taskId, recipient.created_by_user_id, userId, JSON.stringify({ source: SOURCE, recipientId: recipient.id, pushId: recipient.push_id })]);
        } else if (taskId) {
          // Also repairs a task manually closed before managed completion was deployed.
          await connection.execute(`UPDATE tasks SET status=?,completed_at=CASE WHEN ? IN ('completed','overridden') THEN COALESCE(completed_at,UTC_TIMESTAMP()) ELSE NULL END WHERE id=? AND status<>?`,
            [status, status, taskId, status]);
        }
        if (Number(recipient.eligible)) reminders.push({
          recipientId: recipient.id, agencyId: recipient.agency_id, agencyName: recipient.agency_name,
          title: recipient.push_title, status: recipient.status, link, taskId
        });
      }
      await connection.commit();
      return reminders;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async function withdraw({ recipientId, agencyId, pushId, actorUserId, reason }) {
    if (!String(reason || '').trim()) throw fail('A reason is required to remove this recipient.');
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [[recipient]] = await connection.execute('SELECT * FROM provider_update_recipients WHERE id=? AND agency_id=? AND push_id=? FOR UPDATE', [recipientId, agencyId, pushId]);
      if (!recipient) throw Object.assign(new Error('Recipient not found'), { status: 404 });
      if (recipient.status === 'finalized' || recipient.finalized_at || recipient.locked_at) throw fail('A completed update cannot be withdrawn.');
      if (recipient.status !== 'withdrawn') {
        await connection.execute("UPDATE provider_update_recipients SET status='withdrawn',expires_at=UTC_TIMESTAMP() WHERE id=?", [recipientId]);
        await connection.execute(`INSERT INTO provider_update_view_events (recipient_id,event_type,metadata_json) VALUES (?,'admin_withdrawn',?)`,
          [recipientId, JSON.stringify({ actorUserId, reason: reason.trim(), priorStatus: recipient.status, priorExpiresAt: recipient.expires_at })]);
        await connection.execute(`UPDATE tasks SET status='overridden',completed_at=UTC_TIMESTAMP()
          WHERE source_ref_type=? AND source_ref_id=? AND status NOT IN ('completed','overridden')`, [SOURCE, String(recipientId)]);
        await connection.execute(`UPDATE provider_update_training_notices SET status='cancelled'
          WHERE recipient_id=? AND status IN ('queued','failed')`, [recipientId]);
        // Cancel held messages; never alter anything already handed to transport.
        await connection.execute(`UPDATE user_communications c
          JOIN provider_update_reminder_deliveries d ON d.communication_id=c.id
          SET c.delivery_status='skipped' WHERE d.recipient_id=? AND c.delivery_status='pending'`, [recipientId]);
        await connection.execute(`UPDATE user_communications c
          JOIN provider_update_training_notices n ON n.communication_id=c.id
          SET c.delivery_status='skipped' WHERE n.recipient_id=? AND c.delivery_status='pending'`, [recipientId]);
        await connection.execute(`UPDATE user_communications c
          JOIN provider_update_personal_notices n ON n.communication_id=c.id
          JOIN provider_update_sends s ON s.id=n.work_send_id
          SET c.delivery_status='skipped' WHERE s.recipient_id=? AND c.delivery_status='pending'`, [recipientId]);
        await connection.execute(`UPDATE provider_update_personal_notices n
          JOIN provider_update_sends s ON s.id=n.work_send_id
          SET n.status='skipped' WHERE s.recipient_id=? AND n.status IN ('queued','failed')`, [recipientId]);
      }
      await connection.commit();
      return { recipientId, status: 'withdrawn' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
  return { syncUser, withdraw };
}

export const providerUpdateTasks = createProviderUpdateTasks();

export async function closeProviderUpdateTasks(db, recipientId) {
  await db.execute(`UPDATE tasks SET status='completed',completed_at=COALESCE(completed_at,UTC_TIMESTAMP())
    WHERE source_ref_type=? AND source_ref_id=? AND status<>'completed'`, [SOURCE, String(recipientId)]);
}

export async function assertProviderUpdateTaskStatus(taskId, status, db = pool) {
  const [[row]] = await db.execute(`SELECT r.status,r.finalized_at,r.locked_at FROM tasks t
    LEFT JOIN provider_update_recipients r ON r.id=t.source_ref_id
    WHERE t.id=? AND t.source_ref_type=?`, [taskId, SOURCE]);
  if (!row) return;
  if (status === 'completed' && row.status === 'finalized' && row.finalized_at && row.locked_at) return;
  throw fail('Open your Provider Update and submit it from the overview. This task updates automatically when your update is submitted.');
}
