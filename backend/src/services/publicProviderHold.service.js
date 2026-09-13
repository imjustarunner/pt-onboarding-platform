import { createHash, randomBytes } from 'node:crypto';

export const HOLD_MINUTES = 15;
export const hashHoldToken = (token) => createHash('sha256').update(String(token || '')).digest('hex');
export function holdError(message, status = 409) { return Object.assign(new Error(message), { status }); }
export function validateHoldWindow(startAt, endAt, now = Date.now()) {
  const start = new Date(startAt), end = new Date(endAt);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || +start <= now || +end <= +start ||
      +end - +start > 4 * 3600000 || +start - now > 120 * 86400000) {
    throw holdError('Choose a valid future opening within the next 120 days.', 400);
  }
  return { start, end };
}
const sqlDate = (date) => new Date(typeof date === 'string' && /^\d{4}-\d{2}-\d{2} /.test(date) ? date.replace(' ', 'T') + 'Z' : date).toISOString().slice(0, 23).replace('T', ' ');

// Shared by hold creation and public request insertion. Serializes overlapping times,
// including virtual/in-person and affiliations belonging to the same provider.
export async function withProviderSelectionLock(pool, providerId, action) {
  const connection = await pool.getConnection();
  const key = `public-provider-selection:${Number(providerId)}`;
  let locked = false;
  try {
    const [rows] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [key]);
    locked = Number(rows?.[0]?.acquired) === 1;
    if (!locked) throw holdError('This opening is being checked. Please try again.');
    return await action(connection);
  } finally {
    try { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [key]); }
    finally { connection.release(); }
  }
}

export async function assertNoSelectionConflict(connection, { providerId, startAt, endAt, token = '', agencyId }) {
  let holds;
  try {
    [holds] = await connection.execute(
    `SELECT id FROM public_provider_slot_holds WHERE provider_id = ? AND expires_at > UTC_TIMESTAMP(3)
      AND start_at < ? AND end_at > ? AND NOT (agency_id = ? AND token_hash = ?) LIMIT 1`,
    [Number(providerId), sqlDate(endAt), sqlDate(startAt), Number(agencyId), hashHoldToken(token)]);
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    holds = []; // Rolling deploy: no hold exists until its table is created.
  }
  if (holds.length) throw holdError('Someone is temporarily holding this opening. Please choose another time or check again later.');
  const [requests] = await connection.execute(
    `SELECT id FROM public_appointment_requests WHERE provider_id = ?
      AND requested_start_at < ? AND requested_end_at > ?
      AND UPPER(COALESCE(status, 'PENDING')) NOT IN ('DECLINED', 'CANCELLED') LIMIT 1`,
    [Number(providerId), sqlDate(endAt), sqlDate(startAt)]);
  if (requests.length) throw holdError('This opening already has a request. Please choose another time.');
}

export function createPublicProviderHoldService(pool) {
  return {
    async create({ agencyId, providerId, serviceType, modality, startAt, endAt, validateAvailability }) {
      const { start, end } = validateHoldWindow(startAt, endAt);
      return withProviderSelectionLock(pool, providerId, async (connection) => {
        await assertNoSelectionConflict(connection, { agencyId, providerId, startAt: start, endAt: end });
        // Validate published enrollment, accepting status and live schedule while locked.
        await validateAvailability();
        const token = randomBytes(32).toString('hex');
        const [result] = await connection.execute(
          `INSERT INTO public_provider_slot_holds
           (agency_id, provider_id, service_type, modality, start_at, end_at, token_hash, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE))`,
          [agencyId, providerId, serviceType, modality, sqlDate(start), sqlDate(end), hashHoldToken(token)]);
        const [rows] = await connection.execute("SELECT DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS expiresAt FROM public_provider_slot_holds WHERE id = ?", [result.insertId]);
        return { token, expiresAt: rows[0].expiresAt, startAt: start.toISOString(), endAt: end.toISOString(), providerId, serviceType, modality };
      });
    },
    async release({ agencyId, token }) {
      await pool.execute('DELETE FROM public_provider_slot_holds WHERE agency_id = ? AND token_hash = ?', [agencyId, hashHoldToken(token)]);
    }
  };
}
