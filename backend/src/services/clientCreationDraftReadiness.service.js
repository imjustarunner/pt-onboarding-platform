import pool from '../config/database.js';
export async function requireClientCreationDraftSchema(db=pool) {
  // Metadata-only check: a candidate must not serve a draft-saving UI if the
  // additive migration failed. No client content is selected.
  await db.execute('SELECT agency_id,owner_user_id,payload_enc,revision FROM client_creation_drafts LIMIT 0');
}
