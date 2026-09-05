/**
 * Tenant social profile links (Facebook, X, Instagram, YouTube, LinkedIn)
 * with per-channel toggles for staff signatures vs public website.
 */
import pool from '../config/database.js';

export const SOCIAL_PLATFORMS = Object.freeze([
  { id: 'facebook', label: 'Facebook', mark: 'f' },
  { id: 'twitter', label: 'X / Twitter', mark: 'X' },
  { id: 'instagram', label: 'Instagram', mark: 'ig' },
  { id: 'youtube', label: 'YouTube', mark: 'yt' },
  { id: 'linkedin', label: 'LinkedIn', mark: 'in' }
]);

const PLATFORM_IDS = new Set(SOCIAL_PLATFORMS.map((p) => p.id));

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    platform: String(row.platform || '').toLowerCase(),
    url: String(row.url || '').trim(),
    label: row.label || null,
    showOnSignature: !(row.show_on_signature === 0 || row.show_on_signature === false || row.show_on_signature === '0'),
    showOnWebsite: !(row.show_on_website === 0 || row.show_on_website === false || row.show_on_website === '0'),
    sortOrder: Number(row.sort_order || 0),
    isActive: !(row.is_active === 0 || row.is_active === false || row.is_active === '0'),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function normalizeSocialPlatform(raw) {
  const p = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^x$/, 'twitter');
  return PLATFORM_IDS.has(p) ? p : null;
}

export function platformMark(platform) {
  const p = SOCIAL_PLATFORMS.find((x) => x.id === platform);
  return p?.mark || '?';
}

export function platformLabel(platform) {
  const p = SOCIAL_PLATFORMS.find((x) => x.id === platform);
  return p?.label || String(platform || '');
}

export async function listAgencySocialLinks(agencyId, { activeOnly = false } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_social_links
       WHERE agency_id = ?
         ${activeOnly ? 'AND is_active = 1' : ''}
       ORDER BY sort_order ASC, id ASC`,
      [aid]
    );
    return (rows || []).map(mapRow).filter(Boolean);
  } catch (e) {
    if (String(e?.code || '') === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

export async function listSignatureSocialLinks(agencyId) {
  const links = await listAgencySocialLinks(agencyId, { activeOnly: true });
  return links.filter((l) => l.showOnSignature && l.url);
}

export async function listWebsiteSocialLinks(agencyId) {
  const links = await listAgencySocialLinks(agencyId, { activeOnly: true });
  return links.filter((l) => l.showOnWebsite && l.url);
}

export async function getAgencySignatureTagline(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT signature_tagline
       FROM agency_email_settings
       WHERE agency_id = ?
       LIMIT 1`,
      [aid]
    );
    const t = String(rows?.[0]?.signature_tagline || '').trim();
    return t || null;
  } catch (e) {
    if (String(e?.message || '').includes('signature_tagline') || e?.code === 'ER_BAD_FIELD_ERROR') {
      return null;
    }
    throw e;
  }
}

export async function upsertAgencySignatureTagline(agencyId, tagline) {
  const aid = Number(agencyId || 0);
  if (!aid) throw Object.assign(new Error('agencyId required'), { status: 400 });
  const value = tagline == null || String(tagline).trim() === '' ? null : String(tagline).trim().slice(0, 500);
  await pool.execute(
    `INSERT INTO agency_email_settings (agency_id, notifications_enabled, signature_tagline)
     VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE signature_tagline = VALUES(signature_tagline), updated_at = CURRENT_TIMESTAMP`,
    [aid, value]
  );
  return value;
}

export async function upsertAgencySocialLink(agencyId, payload = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) throw Object.assign(new Error('agencyId required'), { status: 400 });
  const platform = normalizeSocialPlatform(payload.platform);
  if (!platform) throw Object.assign(new Error('Invalid platform'), { status: 400 });
  const url = String(payload.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    throw Object.assign(new Error('URL must start with http:// or https://'), { status: 400 });
  }
  const label = payload.label != null ? String(payload.label).trim().slice(0, 120) || null : platformLabel(platform);
  const showOnSignature = payload.showOnSignature === false || payload.showOnSignature === 0 || payload.showOnSignature === '0' ? 0 : 1;
  const showOnWebsite = payload.showOnWebsite === false || payload.showOnWebsite === 0 || payload.showOnWebsite === '0' ? 0 : 1;
  const sortOrder = Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0;
  const isActive = payload.isActive === false || payload.isActive === 0 || payload.isActive === '0' ? 0 : 1;

  await pool.execute(
    `INSERT INTO agency_social_links
      (agency_id, platform, url, label, show_on_signature, show_on_website, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       url = VALUES(url),
       label = VALUES(label),
       show_on_signature = VALUES(show_on_signature),
       show_on_website = VALUES(show_on_website),
       sort_order = VALUES(sort_order),
       is_active = VALUES(is_active),
       updated_at = CURRENT_TIMESTAMP`,
    [aid, platform, url, label, showOnSignature, showOnWebsite, sortOrder, isActive]
  );

  const [rows] = await pool.execute(
    `SELECT * FROM agency_social_links WHERE agency_id = ? AND platform = ? LIMIT 1`,
    [aid, platform]
  );
  return mapRow(rows?.[0]);
}

export async function replaceAgencySocialLinks(agencyId, links = [], { signatureTagline = undefined } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) throw Object.assign(new Error('agencyId required'), { status: 400 });
  const list = Array.isArray(links) ? links : [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM agency_social_links WHERE agency_id = ?`, [aid]);
    let order = 0;
    for (const item of list) {
      const platform = normalizeSocialPlatform(item.platform);
      const url = String(item.url || '').trim();
      if (!platform || !url) continue;
      if (!/^https?:\/\//i.test(url)) continue;
      order += 10;
      const showOnSignature = item.showOnSignature === false || item.showOnSignature === 0 ? 0 : 1;
      const showOnWebsite = item.showOnWebsite === false || item.showOnWebsite === 0 ? 0 : 1;
      const isActive = item.isActive === false || item.isActive === 0 ? 0 : 1;
      await conn.execute(
        `INSERT INTO agency_social_links
          (agency_id, platform, url, label, show_on_signature, show_on_website, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          aid,
          platform,
          url.slice(0, 500),
          item.label != null ? String(item.label).trim().slice(0, 120) || null : platformLabel(platform),
          showOnSignature,
          showOnWebsite,
          Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : order,
          isActive
        ]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  if (signatureTagline !== undefined) {
    await upsertAgencySignatureTagline(aid, signatureTagline);
  }

  return {
    links: await listAgencySocialLinks(aid),
    signatureTagline: await getAgencySignatureTagline(aid)
  };
}

export async function deleteAgencySocialLink(agencyId, linkId) {
  const aid = Number(agencyId || 0);
  const id = Number(linkId || 0);
  if (!aid || !id) return false;
  const [result] = await pool.execute(
    `DELETE FROM agency_social_links WHERE agency_id = ? AND id = ?`,
    [aid, id]
  );
  return Number(result?.affectedRows || 0) > 0;
}
