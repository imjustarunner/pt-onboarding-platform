import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pool from '../config/database.js';

const scrypt = promisify(crypto.scrypt);
const DAYS = 365;
export const kioskCookieName = () => process.env.NODE_ENV === 'production' ? '__Host-auricwell-kiosk' : 'auricwell-kiosk';
export const kioskCookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: DAYS * 86400000 });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const random = bytes => crypto.randomBytes(bytes).toString('hex');
const problem = (status, message) => Object.assign(new Error(message), { status });
function keyed(value) {
  const key = process.env.OFFICE_KIOSK_CODE_SECRET || process.env.JWT_SECRET;
  if (!key || key.length < 32) throw problem(503, 'Kiosk access is not configured yet. Please contact your administrator.');
  return crypto.createHmac('sha256', key).update(`office-kiosk:v1:${value}`).digest('hex');
}
export function codeLookup(code) { return keyed(`code:${code}`); }
export async function hashCode(code, salt) { return (await scrypt(code, salt, 64)).toString('hex'); }

// IP comes from the existing verified-network policy, never a raw client body/header.
// Even rotating IP addresses hits the fleet-wide budgets. Limits include successful attempts.
export async function consumeUnlockAttempt(ip) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[{ now }]] = await connection.execute('SELECT UNIX_TIMESTAMP() AS now');
    const limits = [
      { key: `ip:${ip}`, seconds: 900, max: 5 },
      { key: 'fleet-hour', seconds: 3600, max: 100 },
      { key: 'fleet-day', seconds: 86400, max: 500 }
    ].map(limit => ({ ...limit, bucket: Math.floor(Number(now) / limit.seconds) }));
    let blocked = false;
    for (const limit of limits) {
      const key = keyed(`attempt:${limit.key}:${limit.bucket}`);
      await connection.execute(`INSERT INTO office_kiosk_attempts (bucket_key, attempts, expires_at)
        VALUES (?, 1, FROM_UNIXTIME(?)) ON DUPLICATE KEY UPDATE attempts = LEAST(attempts + 1, 1000000)`,
      [key, (limit.bucket + 1) * limit.seconds]);
      const [[row]] = await connection.execute('SELECT attempts FROM office_kiosk_attempts WHERE bucket_key = ?', [key]);
      // Exhausted IPs cannot repeatedly consume everyone else's setup allowance.
      if (Number(row.attempts) > limit.max) { blocked = true; break; }
    }
    await connection.commit();
    // Keep only current buckets; this also prevents an unbounded IP-address table.
    await connection.execute('DELETE FROM office_kiosk_attempts WHERE expires_at < UTC_TIMESTAMP() LIMIT 100');
    if (blocked) throw problem(429, 'Too many setup attempts. Please try again later or ask your administrator.');
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function unlockOffice(code, ip) {
  await consumeUnlockAttempt(ip);
  const invalid = () => problem(401, 'That code could not unlock the kiosk. Check with your office administrator.');
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw invalid();
  const [[access]] = await pool.execute(`SELECT a.*, l.name FROM office_kiosk_access a
    JOIN office_locations l ON l.id = a.office_location_id AND l.is_active = 1 WHERE a.code_lookup = ?`, [codeLookup(code)]);
  // Equal work for an unknown code; no code/office existence oracle.
  const hash = await hashCode(code, access?.code_salt || '00000000000000000000000000000000');
  if (!access || !crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(access.code_hash, 'hex'))) throw invalid();
  const token = random(32), id = random(16);
  await pool.execute(`INSERT INTO office_kiosk_devices (id, office_location_id, credential_revision, token_hash, expires_at)
    VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${DAYS} DAY))`, [id, access.office_location_id, access.revision, digest(token)]);
  return { token, session: { locationId: access.office_location_id, locationName: access.name } };
}

export async function readOfficeDevice(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [[device]] = await pool.execute(`SELECT d.id, d.office_location_id AS locationId, l.name AS locationName,
    d.last_seen_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) AS renew
    FROM office_kiosk_devices d JOIN office_kiosk_access a ON a.office_location_id = d.office_location_id AND a.revision = d.credential_revision
    JOIN office_locations l ON l.id = d.office_location_id AND l.is_active = 1
    WHERE d.token_hash = ? AND d.revoked_at IS NULL AND d.expires_at > UTC_TIMESTAMP()`, [digest(token)]);
  if (!device) return null;
  if (device.renew) await pool.execute(`UPDATE office_kiosk_devices SET last_seen_at = UTC_TIMESTAMP(),
    expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${DAYS} DAY) WHERE id = ? AND revoked_at IS NULL`, [device.id]);
  return device;
}

export async function revokeToken(token) {
  if (typeof token === 'string') await pool.execute('UPDATE office_kiosk_devices SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ?', [digest(token)]);
}
export async function rotateOfficeCode(officeId, userId) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(crypto.randomInt(1000000)).padStart(6, '0'), salt = random(16), revision = random(16);
    const hash = await hashCode(code, salt);
    try {
      // UPDATE first: a duplicate lookup must NEVER update another building's row.
      const [result] = await pool.execute(`UPDATE office_kiosk_access SET code_lookup=?, code_salt=?, code_hash=?, revision=?, updated_by=?, updated_at=UTC_TIMESTAMP() WHERE office_location_id=?`,
        [codeLookup(code), salt, hash, revision, userId, officeId]);
      if (!result.affectedRows) await pool.execute(`INSERT INTO office_kiosk_access (office_location_id, code_lookup, code_salt, code_hash, revision, updated_by) VALUES (?, ?, ?, ?, ?, ?)`, [officeId, codeLookup(code), salt, hash, revision, userId]);
      return { code }; // Shown once to an authorized administrator; never logged or stored in plaintext.
    } catch (error) { if (error.code !== 'ER_DUP_ENTRY') throw error; }
  }
  throw problem(503, 'Could not generate a kiosk code. Please try again.');
}
export async function officeAccessStatus(officeId) {
  const [[access]] = await pool.execute('SELECT updated_at FROM office_kiosk_access WHERE office_location_id = ?', [officeId]);
  const [devices] = await pool.execute(`SELECT d.id, d.created_at, d.last_seen_at FROM office_kiosk_devices d
    JOIN office_kiosk_access a ON a.office_location_id=d.office_location_id AND a.revision=d.credential_revision
    WHERE d.office_location_id=? AND d.revoked_at IS NULL AND d.expires_at > UTC_TIMESTAMP() ORDER BY d.created_at DESC`, [officeId]);
  return { configured: !!access, updatedAt: access?.updated_at || null, devices };
}
export async function revokeOfficeDevice(officeId, deviceId) {
  await pool.execute('UPDATE office_kiosk_devices SET revoked_at=UTC_TIMESTAMP() WHERE id=? AND office_location_id=?', [deviceId, officeId]);
}
