import pool from '../config/database.js';
import { canManageEventConversation, syncCompanyEventConversation } from '../services/companyEventConversation.service.js';
import { isCompanyEventInvitee } from '../services/companyEventAudience.service.js';
import { findCompanyEventPage } from '../services/companyEventPages.service.js';

export async function openCompanyEventConversation(req, res, next) {
  try {
    const page = req.params.organizationSlug ? await findCompanyEventPage(req.params) : null;
    if(req.params.organizationSlug && !page)return res.status(404).json({error:{message:'Event not found'}});
    const eventId = Number(page?.id || req.params.eventId || req.params.id);
    const [[event]] = page ? [[page]] : await pool.execute('SELECT * FROM company_events WHERE id=? AND is_active=1 LIMIT 1', [eventId]);
    if (!event || (req.params.eventId && Number(req.params.id) !== Number(event.agency_id))) return res.status(404).json({ error: { message: 'Event not found' } });
    const canManage = await canManageEventConversation(event, req.user);
    if (!canManage && !await isCompanyEventInvitee({ event, userId: req.user.id })) return res.status(403).json({ error: { message: 'This conversation is for event invitees.' } });
    // Opening the conversation never sends a message. Use the normal composer.
    const conversation = await syncCompanyEventConversation({ eventId, create: true });
    if (canManage && !await isCompanyEventInvitee({ event, userId: req.user.id })) {
      await pool.execute('INSERT IGNORE INTO chat_thread_participants (thread_id,user_id) VALUES (?,?)', [conversation.threadId, req.user.id]);
    }
    return res.json(conversation);
  } catch (error) { next(error); }
}
