import pool from '../config/database.js';
import { maybeEncryptNotePayload } from './clinicalNoteCrypto.service.js';

export function presenterAgendaItems(presenters) {
  if (!presenters.length) return [];
  return [
    ...presenters.map(p => ({ key: `presenter:${Number(p.user_id)}`, title: `Presentation — ${p.name}` })),
    { key: 'group_processing', title: 'Open group processing' }
  ];
}

export async function syncSupervisionAgenda(sessionId) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[session]] = await db.execute('SELECT * FROM supervision_sessions WHERE id=? FOR UPDATE', [sessionId]);
    if (!session || session.session_type !== 'group') { await db.rollback(); return; }
    const [presenters] = await db.execute(`SELECT p.user_id, TRIM(CONCAT_WS(' ',u.first_name,u.last_name)) name
      FROM supervision_session_presenters p JOIN users u ON u.id=p.user_id WHERE p.session_id=? ORDER BY p.presenter_role,p.user_id`, [sessionId]);
    await db.execute(`INSERT INTO meeting_agendas (agency_id,meeting_type,meeting_id,created_by_user_id)
      VALUES (?,'supervision_session',?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`, [session.agency_id, sessionId, session.created_by_user_id]);
    const [[agenda]] = await db.execute("SELECT id FROM meeting_agendas WHERE meeting_type='supervision_session' AND meeting_id=?", [sessionId]);
    const [existing] = await db.execute('SELECT id,generated_key,sort_order FROM meeting_agenda_items WHERE meeting_agenda_id=? ORDER BY sort_order,id', [agenda.id]);
    const desired = presenterAgendaItems(presenters);
    for (const item of existing.filter(i => i.generated_key && !desired.some(d => d.key === i.generated_key))) {
      await db.execute('DELETE FROM meeting_agenda_items WHERE id=?', [item.id]);
    }
    let order = existing.reduce((max, item) => Math.max(max, Number(item.sort_order)), -1) + 1;
    // Retain all existing positions, including manual moves before a presentation.
    for (const item of desired) {
      const old = existing.find(i => i.generated_key === item.key);
      if (old) continue;
      const processing = existing.find(i => i.generated_key === 'group_processing');
      const insertAt = item.key.startsWith('presenter:') && processing ? Number(processing.sort_order) : order;
      if (insertAt < order) {
        await db.execute('UPDATE meeting_agenda_items SET sort_order=sort_order+1 WHERE meeting_agenda_id=? AND sort_order>=?', [agenda.id,insertAt]);
        for (const entry of existing) if (Number(entry.sort_order) >= insertAt) entry.sort_order = Number(entry.sort_order)+1;
      }
      await db.execute(`INSERT INTO meeting_agenda_items (meeting_agenda_id,title,sort_order,created_by_user_id,generated_key)
        VALUES (?,?,?,?,?)`, [agenda.id, maybeEncryptNotePayload(item.title), insertAt, session.created_by_user_id, item.key]);
      order++;
    }
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
