import pool from '../config/database.js';
import { isExternalTestingEmail } from '../utils/externalTestingEmail.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import { sendTicketAssignmentEmail } from './ticketAssignmentEmail.service.js';
import { RACHEL_SCHOOL_EMAIL } from './messageInboxPolicy.js';

const stages = { invite: 'Invitation sent', reminder: 'Reminder sent', completed: 'Onboarding completed' };

/** One assigned work ticket per school onboarding journey. Retries append no
 * duplicate stage entries, and automation is never attributed to a human. */
export async function syncSchoolOnboardingWorkflowTicket({ inviteId, stage, stageKey }, dependencies = {}) {
  if (!stages[stage]) throw new Error('Unknown school onboarding stage');
  const database = dependencies.database || pool;
  const db = await database.getConnection();
  let ticketId;
  try {
    await db.beginTransaction();
    const [[invite]] = await db.execute(`SELECT i.*,a.slug AS agency_slug FROM school_onboarding_invites i
      JOIN agencies a ON a.id=i.agency_id WHERE i.id=? FOR UPDATE`, [inviteId]);
    if (!invite || invite.agency_slug !== 'itsco' || isExternalTestingEmail(invite.contact_email)) { await db.commit(); return { skipped: true, reason: 'outside_itsco_workflow' }; }
    const [owners] = await db.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      AND ua.agency_id=? AND ua.is_active=1 WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND COALESCE(u.is_demo,0)=0 AND u.status IN ('ACTIVE','ACTIVE_EMPLOYEE')
      AND u.role IN ('admin','support','staff','super_admin')
      AND ? COLLATE utf8mb4_unicode_ci IN (LOWER(u.email),LOWER(u.work_email),LOWER(u.username))`, [invite.agency_id, RACHEL_SCHOOL_EMAIL]);
    if (owners.length !== 1) throw Object.assign(new Error('School onboarding assignee must be uniquely configured.'), { code: 'SCHOOL_ONBOARDING_ASSIGNEE_UNAVAILABLE' });
    const [[link]] = await db.execute('SELECT ticket_id,stage_key FROM school_onboarding_workflow_tickets WHERE invite_id=? FOR UPDATE', [inviteId]);
    const key = String(stageKey || stage).slice(0, 160);
    if (link?.stage_key === key) { await db.commit(); return { ticketId: link.ticket_id, duplicate: true }; }
    const enc = prepareEncryptedTicketText(`Review the school onboarding journey for ${invite.school_name || 'this school'}. Current stage: ${stages[stage]}.`);
    if (link) {
      ticketId = link.ticket_id;
      await db.execute(`UPDATE support_tickets SET claimed_by_user_id=COALESCE(claimed_by_user_id,?),
        claimed_at=COALESCE(claimed_at,CURRENT_TIMESTAMP),status='open',updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?`,
      [owners[0].id, ticketId, invite.agency_id]);
      await db.execute('UPDATE school_onboarding_workflow_tickets SET stage=?,stage_key=? WHERE invite_id=?', [stage, key, inviteId]);
    } else {
      const [created] = await db.execute(`INSERT INTO support_tickets
        (agency_id,school_organization_id,created_by_user_id,created_by_source_key,source_channel,subject,
         question,question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id,topic,status,claimed_by_user_id,claimed_at)
        VALUES (?,?,NULL,'school_onboarding_workflow','portal',?,?,?,?,?,?,'general','open',?,CURRENT_TIMESTAMP)`,
      [invite.agency_id, invite.school_organization_id || invite.agency_id, `School onboarding: ${invite.school_name || `Invite #${inviteId}`}`,
        enc.plain, enc.ciphertext, enc.iv, enc.authTag, enc.keyId, owners[0].id]);
      ticketId = created.insertId;
      await db.execute('INSERT INTO school_onboarding_workflow_tickets (invite_id,ticket_id,stage_key,stage) VALUES (?,?,?,?)', [inviteId, ticketId, key, stage]);
    }
    const note = prepareEncryptedTicketText(`Automation: ${stages[stage]} for school onboarding invite #${inviteId}. Default owner: Rachel (${RACHEL_SCHOOL_EMAIL}).`);
    await db.execute(`INSERT INTO support_ticket_messages
      (ticket_id,author_user_id,author_role,body,body_ciphertext,body_iv,body_auth_tag,encryption_key_id,is_internal)
      VALUES (?,NULL,'system',?,?,?,?,?,1)`, [ticketId, note.plain, note.ciphertext, note.iv, note.authTag, note.keyId]);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
  const sendAssignment = dependencies.sendAssignment || sendTicketAssignmentEmail;
  const email = await sendAssignment({ ticketId }, { database });
  return { ticketId, email };
}

export async function runSchoolOnboardingWorkflowTickets({ database = pool, limit = 50 } = {}) {
  const [rows] = await database.execute(`SELECT pending.* FROM (SELECT i.id,i.status,i.updated_at AS workflow_at,linked.stage_key AS linked_stage_key,
    (SELECT d.id FROM school_onboarding_email_deliveries d WHERE d.invite_id=i.id AND d.delivery_status='sent' ORDER BY d.id DESC LIMIT 1) AS delivery_id,
    (SELECT d.kind FROM school_onboarding_email_deliveries d WHERE d.invite_id=i.id AND d.delivery_status='sent' ORDER BY d.id DESC LIMIT 1) AS delivery_kind
    FROM school_onboarding_invites i JOIN agencies a ON a.id=i.agency_id AND a.slug='itsco'
    LEFT JOIN school_onboarding_workflow_tickets linked ON linked.invite_id=i.id
    JOIN ticket_assignment_email_settings settings ON settings.id=1
    WHERE i.status<>'revoked' AND LOWER(COALESCE(i.contact_email,'')) NOT REGEXP '^testing([+][^@]+)?@' AND (i.submitted_at>=settings.enabled_at OR EXISTS
      (SELECT 1 FROM school_onboarding_email_deliveries d WHERE d.invite_id=i.id AND d.delivery_status='sent' AND d.sent_at>=settings.enabled_at))
    ) pending WHERE (pending.status='submitted' AND COALESCE(pending.linked_stage_key,'')<>'completed')
      OR (pending.status<>'submitted' AND pending.delivery_id IS NOT NULL AND COALESCE(pending.linked_stage_key,'')<>CONCAT(pending.delivery_kind,':',pending.delivery_id))
    ORDER BY pending.workflow_at DESC LIMIT ${Math.max(1, Math.min(100, Number(limit) || 50))}`);
  const result = [];
  for (const row of rows) {
    const stage = row.status === 'submitted' ? 'completed' : row.delivery_kind;
    if (!stages[stage]) continue;
    try { result.push(await syncSchoolOnboardingWorkflowTicket({ inviteId: row.id, stage, stageKey: stage === 'completed' ? 'completed' : `${stage}:${row.delivery_id}` }, { database })); }
    catch (error) { result.push({ inviteId: row.id, status: 'review', code: error.code || 'onboarding_ticket_failed' }); }
  }
  return result;
}
