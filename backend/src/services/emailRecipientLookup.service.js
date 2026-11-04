import pool from '../config/database.js';

/**
 * Best-effort lookup for a `users.id` matching the recipient email, so anonymous
 * sends (e.g., notification emails not initiated by a specific admin) can still
 * be attributed to the recipient's profile and surface in their Communications tab.
 * Returns null when no match (e.g., emailing a non-user contact address).
 */
export async function resolveRecipientUserIdByEmail(to) {
  const email = String(to || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  try {
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
      [email]
    );
    const id = Number(rows?.[0]?.id || 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
