import pool from '../config/database.js';
import {
  mergeMetadataDraftSources,
  parseMetadataJson
} from '../utils/schoolSupportDraftSources.shared.js';

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function persistTicketDraftSources(ticketId, draftSources, extraMetadata = {}) {
  const tid = safeInt(ticketId);
  if (!tid) return null;

  const [rows] = await pool.execute(
    `SELECT ai_draft_metadata_json FROM support_tickets WHERE id = ? LIMIT 1`,
    [tid]
  );
  const existing = rows?.[0]?.ai_draft_metadata_json;
  const merged = mergeMetadataDraftSources(existing, draftSources, extraMetadata);

  await pool.execute(
    `UPDATE support_tickets SET ai_draft_metadata_json = ? WHERE id = ?`,
    [JSON.stringify(merged), tid]
  );
  return merged;
}

export async function loadTicketMetadata(ticketId) {
  const tid = safeInt(ticketId);
  if (!tid) return null;
  const [rows] = await pool.execute(
    `SELECT ai_draft_metadata_json FROM support_tickets WHERE id = ? LIMIT 1`,
    [tid]
  );
  return parseMetadataJson(rows?.[0]?.ai_draft_metadata_json);
}
