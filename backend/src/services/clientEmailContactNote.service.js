/**
 * When an email chain is logged against a client, mirror a Contact note on the
 * client file (client_notes) so it is accessible from the chart / record.
 */
import ClientNotes from '../models/ClientNotes.model.js';
import pool from '../config/database.js';

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create or refresh a contact note summarizing an email for the client chart.
 * Best-effort — never throws to callers of email logging.
 */
export async function upsertClientContactNoteFromEmail({
  clientId,
  agencyId = null,
  authorId = null,
  to = '',
  from = '',
  subject = '',
  body = '',
  templateType = '',
  communicationId = null,
  direction = 'outbound'
} = {}) {
  const cid = Number(clientId || 0);
  if (!cid) return null;

  try {
    const fromLine = String(from || '').trim() || 'agency';
    const toLine = String(to || '').trim() || 'recipient';
    const subj = String(subject || '').trim() || '(no subject)';
    const preview = stripHtml(body).slice(0, 400);
    const tmpl = String(templateType || '').trim();
    const dir = String(direction || 'outbound').toLowerCase() === 'inbound' ? 'Inbound' : 'Outbound';
    const author = Number(authorId || 0) || null;

    const message = [
      `Contact note — ${dir} email`,
      `From: ${fromLine}`,
      `To: ${toLine}`,
      `Subject: ${subj}`,
      tmpl ? `Type: ${tmpl}` : null,
      communicationId ? `Communication #${communicationId}` : null,
      preview ? `Preview: ${preview}` : null
    ]
      .filter(Boolean)
      .join('\n');

    if (communicationId) {
      const [existing] = await pool.execute(
        `SELECT id FROM client_notes
         WHERE client_id = ?
           AND category = 'contact'
           AND message LIKE ?
         ORDER BY id DESC
         LIMIT 1`,
        [cid, `%Communication #${Number(communicationId)}%`]
      );
      const hit = existing?.[0];
      if (hit?.id && author) {
        try {
          return await ClientNotes.update(
            hit.id,
            { message, category: 'contact', urgency: 'low', is_internal_only: true },
            author,
            'admin'
          );
        } catch {
          // create a new row below
        }
      }
    }

    if (!author) {
      console.warn('[clientEmailContactNote] skip create — no authorId', { clientId: cid });
      return null;
    }

    return ClientNotes.create(
      {
        client_id: cid,
        author_id: author,
        message,
        category: 'contact',
        urgency: 'low',
        is_internal_only: true
      },
      { hasAgencyAccess: true, canViewInternalNotes: true }
    );
  } catch (err) {
    console.warn('[clientEmailContactNote] upsert failed:', err?.message || err, { clientId, agencyId });
    return null;
  }
}

export default { upsertClientContactNoteFromEmail };
