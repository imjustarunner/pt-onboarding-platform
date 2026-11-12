import {resolveSupportTicketEmailThread} from './supportTicketEmail.service.js';
import {recordTicketAssignment} from './ticketAssignment.service.js';
import pool from '../config/database.js';
import { assertDepartmentalGroupAccess, groupKeyForIdentity } from './departmentalGroupAccess.service.js';
import { supportEmailError } from './supportTicketEmailPolicy.js';

/** Claim the ticket first; its canonical claimant controls every inbox view. */
export async function claimGroupEmailConversation({ conversationId, userId }, dependencies = {}) {
  const database = dependencies.database || pool;
  const assertAccess = dependencies.assertAccess || assertDepartmentalGroupAccess;
  const db = await database.getConnection();
  try {
    await db.beginTransaction();
    const [[actor]]=await db.execute('SELECT role FROM users WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[userId]);
    if(!['admin','super_admin','support'].includes(actor?.role))throw supportEmailError('Only Support, Admin and Superadmin can own support tickets.',403);
    const [[row]] = await db.execute(`SELECT c.id,c.agency_id,c.support_ticket_id,
      i.identity_key,i.kind,i.from_email,t.claimed_by_user_id,t.status,t.source_channel,t.source_email_thread_id,t.school_organization_id,t.client_id,t.topic
      FROM communication_conversations c JOIN communication_inboxes i ON i.id=c.inbox_id
      JOIN support_tickets t ON t.id=c.support_ticket_id AND t.agency_id=c.agency_id
      WHERE c.id=? FOR UPDATE`, [conversationId]);
    const groupKey = groupKeyForIdentity(row);
    if (!row || !groupKey) throw supportEmailError('A linked group email ticket is required.', 404);
    await assertAccess({ agencyId: row.agency_id, userId, groupKey, db });
    const canonical=await resolveSupportTicketEmailThread({...row,id:row.support_ticket_id},db);
    if(canonical.canonicalTicketId!==Number(row.support_ticket_id))throw supportEmailError(`Open ticket #${canonical.canonicalTicketId} to manage this conversation.`,409);
    if (row.claimed_by_user_id && Number(row.claimed_by_user_id) !== Number(userId)) {
      throw supportEmailError('Ticket is already claimed by another team member.', 409, 'TICKET_ALREADY_CLAIMED');
    }
    if (['closed','resolved','done'].includes(row.status)) throw supportEmailError('This ticket is closed.', 409);
    if (!row.claimed_by_user_id) {
      const [claim] = await db.execute(`UPDATE support_tickets SET claimed_by_user_id=?,claimed_at=CURRENT_TIMESTAMP
        WHERE id=? AND agency_id=? AND claimed_by_user_id IS NULL`, [userId, row.support_ticket_id, row.agency_id]);
      if (Number(claim.affectedRows) !== 1) throw supportEmailError('Ticket was just claimed by another team member.', 409, 'TICKET_ALREADY_CLAIMED');
    }
    if(!row.claimed_by_user_id)await recordTicketAssignment({ticketId:row.support_ticket_id,agencyId:row.agency_id,actorUserId:userId,assigneeUserId:userId,kind:'claimed',reason:'Claimed in shared inbox'},db);
    await db.execute('UPDATE communication_conversations SET owner_user_id=? WHERE id=?', [userId, row.id]);
    await db.commit();
    return { ticketId: row.support_ticket_id, conversationId: row.id, claimedByUserId: userId };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
}
