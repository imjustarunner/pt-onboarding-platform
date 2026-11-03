import pool from '../config/database.js';

// A school-specific blurb wins; the already-public biography fills an empty card.
export async function fillPublicProviderBlurbs(providers, db = pool) {
  const missing = providers.filter(p => !String(p.school_info_blurb || '').trim());
  const ids = [...new Set(missing.map(p => Number(p.provider_user_id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return providers;
  let rows;
  try {
    [rows] = await db.execute(`SELECT user_id, public_blurb FROM provider_public_profiles WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids);
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return providers;
    throw error;
  }
  const blurbs = new Map(rows.map(row => [Number(row.user_id), String(row.public_blurb || '').trim()]));
  for (const provider of missing) provider.school_info_blurb = blurbs.get(Number(provider.provider_user_id)) || null;
  return providers;
}
