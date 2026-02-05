import pool from '../config/database.js';
import crypto from 'crypto';

export async function generateUniqueSixDigitClientCode({ agencyId }) {
  const parsedAgencyId = parseInt(String(agencyId || ''), 10);
  if (!parsedAgencyId) {
    throw new Error('agencyId is required to generate client code');
  }

  // Best-effort uniqueness within an agency. Retry a few times to avoid collisions.
  for (let i = 0; i < 25; i += 1) {
    const n = crypto.randomInt(0, 1000000);
    const code = String(n).padStart(6, '0');
    const [rows] = await pool.execute(
      `SELECT id FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`,
      [parsedAgencyId, code]
    );
    if (!rows?.[0]?.id) return code;
  }

  throw new Error('Unable to generate unique client code');
}
