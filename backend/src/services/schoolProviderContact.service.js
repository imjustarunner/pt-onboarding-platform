import pool from '../config/database.js';

const email = value => {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
};

async function optionalRows(database, sql, values) {
  try {
    const [rows] = await database.execute(sql, values);
    return rows;
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return [];
    throw error;
  }
}

/** Use saved contact identities for the school's parent agency; never invent an address. */
export async function fillAgencyProviderContactEmails(providers, agencyId, database = pool) {
  const ids = [...new Set((providers || []).map(provider => Number(provider.provider_user_id || provider.id))
    .filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!Number(agencyId) || !ids.length) return providers;
  const placeholders = ids.map(() => '?').join(',');
  const [identities, aliases] = await Promise.all([
    optionalRows(database, `SELECT identity_key, from_email FROM email_sender_identities
      WHERE agency_id = ? AND is_active = TRUE AND identity_key IN (${placeholders}) ORDER BY id ASC`,
    [Number(agencyId), ...ids.map(id => `personal_${id}`)]),
    optionalRows(database, `SELECT user_id, email FROM user_login_emails
      WHERE agency_id = ? AND user_id IN (${placeholders}) ORDER BY id ASC`, [Number(agencyId), ...ids])
  ]);
  const personal = new Map(), login = new Map();
  for (const row of identities) {
    const address = email(row.from_email);
    if (address && !personal.has(row.identity_key)) personal.set(row.identity_key, address);
  }
  for (const row of aliases) {
    const address = email(row.email), id = Number(row.user_id);
    if (address && !login.has(id)) login.set(id, address);
  }
  for (const provider of providers) {
    const id = Number(provider.provider_user_id || provider.id);
    provider.email = personal.get(`personal_${id}`) || login.get(id) || email(provider.email);
  }
  return providers;
}
