import pool from '../config/database.js';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// The caller authenticates the staff account or its personal invitation token.
// Lock the existing need-list rows so two invitees cannot claim the same slot.
export async function saveStaffPotluckContribution({ eventId, agencyId, userId, itemId, customItemName }, db = pool) {
  const id = itemId == null || itemId === '' ? null : Number(itemId);
  if (id !== null && (!Number.isSafeInteger(id) || id < 1)) throw fail('Choose a valid requested item.');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[event]] = await conn.execute('SELECT id,is_active,potluck_enabled,ends_at FROM company_events WHERE id = ? AND agency_id = ? FOR UPDATE', [eventId,agencyId]);
    if (!event || !event.is_active || !event.potluck_enabled) throw fail('Potluck signup is not available for this event.', 404);
    if (event.ends_at && new Date(event.ends_at).getTime() <= Date.now()) throw fail('This event has ended.', 409);
    const [items] = await conn.execute('SELECT * FROM company_event_need_list_items WHERE company_event_id = ? AND agency_id = ? FOR UPDATE', [eventId,agencyId]);
    const selected = items.find(item => Number(item.id) === id);
    if (id && (!selected || selected.claimed_by_guest_email || selected.claimed_by_guest_name || (selected.claimed_by_user_id && Number(selected.claimed_by_user_id) !== userId))) throw fail('That item has already been claimed. Refresh and choose another item.', 409);
    const open = selected && String(selected.item_notes || '').trim().toUpperCase().startsWith('[OPEN_REQUEST_SLOT]');
    const name = String(customItemName || '').trim();
    if (name.length > 255 || (open && !name)) throw fail('Tell us what you are bringing (up to 255 characters).');
    const ownCustom = items.find(item => Number(item.claimed_by_user_id) === userId && String(item.item_notes || '').startsWith('[INVITEE_CONTRIBUTION]'));
    await conn.execute('UPDATE company_event_need_list_items SET claimed_by_user_id = NULL, claimed_at = NULL WHERE company_event_id = ? AND agency_id = ? AND claimed_by_user_id = ?', [eventId,agencyId,userId]);
    if (selected) await conn.execute('UPDATE company_event_need_list_items SET claimed_by_user_id = ?, claimed_at = UTC_TIMESTAMP(), item_name = ? WHERE id = ? AND company_event_id = ?', [userId,open ? name : selected.item_name,id,eventId]);
    if (!id && name) {
      if (ownCustom) await conn.execute('UPDATE company_event_need_list_items SET item_name=?,claimed_by_user_id=?,claimed_at=UTC_TIMESTAMP() WHERE id=? AND company_event_id=?', [name,userId,ownCustom.id,eventId]);
      else await conn.execute("INSERT INTO company_event_need_list_items (company_event_id,agency_id,item_name,item_category,item_notes,claimed_by_user_id,claimed_at,created_by_user_id) VALUES (?,?,?,'Other','[INVITEE_CONTRIBUTION]',?,UTC_TIMESTAMP(),?)", [eventId,agencyId,name,userId,userId]);
    } else if (ownCustom && Number(ownCustom.id) !== id) await conn.execute('DELETE FROM company_event_need_list_items WHERE id=? AND company_event_id=?', [ownCustom.id,eventId]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
