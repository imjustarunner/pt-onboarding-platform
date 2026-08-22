/**
 * Stored school paper packets. Click path reads GCS; Chromium only runs when
 * the roster/template hash changed. Digital-form PDF rendering is untouched.
 */
import pool from '../config/database.js';
import AgencySchool from '../models/AgencySchool.model.js';
import StorageService from './storage.service.js';
import {
  buildSchoolPrintablePacketContext,
  generateSchoolPrintablePacketPdf,
  schoolPrintablePacketContentHash
} from './schoolPrintablePacket.service.js';
import { normalizeLocale } from '../models/SchoolPacketTemplate.model.js';
import {
  canonicalSchoolPacketVersionLabel,
  computeNextSchoolPacketVersion,
  inferPacketChangeReason,
  parseSchoolPacketVersionLabel,
  resolveAgencyPacketMajorVersion
} from '../utils/schoolPacketVersion.util.js';

const inflight = new Map();

function cacheKey(schoolOrganizationId, locale) {
  return `${Number(schoolOrganizationId)}:${normalizeLocale(locale)}`;
}

// ─── Per-school packet version helpers ───────────────────────────────────────
// Labels: "{agencyMajor}.{schoolRevision}" — see schoolPacketVersion.util.js

async function orgVersionsTableExists() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_packet_org_versions'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function columnExists(table, column) {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Returns (and creates if needed) a version row for this school/locale/hash combination.
 * When the hash is new, version_minor increments for this school only.
 * version_major follows agencies.packet_version_label (rare manual major bumps).
 * @param {number} schoolOrganizationId
 * @param {string} locale
 * @param {string} contentHash
 * @param {string|null} changeReason
 * @param {Array|null} providers  - provider objects from packetContext; persisted to providers_json
 * @param {number|null} templateVersionSnapshot - template_version active at render time
 * @param {Array|null} staffRows - school staff from packetContext; persisted to staff_json
 */
async function getOrCreateSchoolPacketVersion(
  schoolOrganizationId,
  locale,
  contentHash,
  changeReason = null,
  providers = null,
  templateVersionSnapshot = null,
  staffRows = null,
  agencyMajorVersion = 1
) {
  const sid = Number(schoolOrganizationId || 0);
  const loc = normalizeLocale(locale);
  if (!sid || !(await orgVersionsTableExists())) return null;

  const providersJson = Array.isArray(providers) ? JSON.stringify(
    providers.map((p) => ({
      id: Number(p.id || p.userId || p.user_id || 0) || null,
      userId: Number(p.userId || p.user_id || p.id || 0) || null,
      fullName: String(p.fullName || p.full_name || '').trim() || null,
      role: String(p.role || p.effective_role || '').trim() || null,
      schoolAssigned: Boolean(p.schoolAssigned || p.school_assigned)
    }))
  ) : null;

  const staffJson = Array.isArray(staffRows) ? JSON.stringify(
    staffRows.map((r) => {
      const id = Number(r.school_staff_user_id || r.id || r.user_id || 0) || null;
      const first = String(r.first_name || '').trim();
      const last = String(r.last_name || '').trim();
      const fullName = String(r.full_name || r.fullName || `${first} ${last}`).trim() || null;
      return {
        id,
        schoolStaffUserId: id,
        firstName: first || null,
        lastName: last || null,
        fullName,
        email: String(r.email || '').trim() || null,
        role: String(r.role_title || r.role || r.title || '').trim() || null
      };
    }).filter((s) => s.id)
  ) : null;

  const hasStaffCol = await columnExists('school_packet_org_versions', 'staff_json');

  try {
    // Fast path: hash already has a version row.
    const [existing] = await pool.execute(
      `SELECT id, version_major, version_minor, version_label, storage_path, providers_json
              ${hasStaffCol ? ', staff_json' : ''}
       FROM school_packet_org_versions
       WHERE school_organization_id = ? AND locale = ? AND content_hash = ?
       LIMIT 1`,
      [sid, loc, contentHash]
    );
    if (existing.length) {
      // Back-fill providers_json if it was empty on a previous run.
      if (providersJson && !existing[0].providers_json) {
        await pool.execute(
          `UPDATE school_packet_org_versions SET providers_json = ? WHERE id = ?`,
          [providersJson, existing[0].id]
        ).catch(() => { /* best-effort */ });
        existing[0].providers_json = providersJson;
      }
      if (hasStaffCol && staffJson && !existing[0].staff_json) {
        await pool.execute(
          `UPDATE school_packet_org_versions SET staff_json = ? WHERE id = ?`,
          [staffJson, existing[0].id]
        ).catch(() => { /* best-effort */ });
        existing[0].staff_json = staffJson;
      }
      return existing[0];
    }

    // Get the latest version for this school to determine the next version counters.
    const [latestRows] = await pool.execute(
      `SELECT version_major, version_minor, template_version_snapshot,
              providers_json, staff_json
       FROM school_packet_org_versions
       WHERE school_organization_id = ? AND locale = ?
       ORDER BY version_major DESC, version_minor DESC
       LIMIT 1`,
      [sid, loc]
    );
    const latest = latestRows[0] || null;
    const templateVer = Number(templateVersionSnapshot || 1) || 1;
    const agencyMajor = Math.max(1, Number(agencyMajorVersion || 1));
    const resolvedChangeReason = changeReason || inferPacketChangeReason({
      latestRow: latest,
      agencyMajorVersion: agencyMajor,
      templateVersionSnapshot: templateVer,
      providers,
      staffRows
    });
    const { major: newMajor, minor: newMinor, label } = computeNextSchoolPacketVersion(
      latest,
      agencyMajor
    );

    // Check whether the new columns exist (may not if migration 1262 hasn't run yet).
    const hasPrecisionCols = await columnExists('school_packet_org_versions', 'version_tenths');

    if (hasPrecisionCols && hasStaffCol) {
      await pool.execute(
        `INSERT INTO school_packet_org_versions
           (school_organization_id, locale, version_major, version_minor,
            version_tenths, version_hundredths, version_thousandths,
            version_label, content_hash, change_reason, providers_json, staff_json, template_version_snapshot)
         VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [sid, loc, newMajor, newMinor,
         label, contentHash, resolvedChangeReason || null, providersJson, staffJson,
         templateVer]
      );
    } else if (hasPrecisionCols) {
      await pool.execute(
        `INSERT INTO school_packet_org_versions
           (school_organization_id, locale, version_major, version_minor,
            version_tenths, version_hundredths, version_thousandths,
            version_label, content_hash, change_reason, providers_json, template_version_snapshot)
         VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [sid, loc, newMajor, newMinor,
         label, contentHash, resolvedChangeReason || null, providersJson,
         templateVer]
      );
    } else {
      // Fallback for pre-migration-1262 environments.
      await pool.execute(
        `INSERT INTO school_packet_org_versions
           (school_organization_id, locale, version_major, version_minor,
            version_label, content_hash, change_reason, providers_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [sid, loc, newMajor, newMinor, label, contentHash, resolvedChangeReason || null, providersJson]
      );
    }

    const [created] = await pool.execute(
      `SELECT id, version_major, version_minor, version_label, storage_path, providers_json
              ${hasStaffCol ? ', staff_json' : ''}
       FROM school_packet_org_versions
       WHERE school_organization_id = ? AND locale = ? AND content_hash = ?
       LIMIT 1`,
      [sid, loc, contentHash]
    );
    return created[0] || null;
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[printable-packet] getOrCreateSchoolPacketVersion failed:', e?.message || e);
    }
    return null;
  }
}

async function saveVersionStoragePath(versionId, storagePath) {
  if (!versionId || !storagePath || !(await orgVersionsTableExists())) return;
  try {
    await pool.execute(
      `UPDATE school_packet_org_versions SET storage_path = ? WHERE id = ?`,
      [storagePath, versionId]
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Returns all version rows for a school in descending order (newest first).
 * Suitable for the "previous versions" admin panel.
 */
export async function listSchoolPacketVersionHistory(schoolOrganizationId, locale = 'en') {
  const sid = Number(schoolOrganizationId || 0);
  const loc = normalizeLocale(locale);
  if (!sid || !(await orgVersionsTableExists())) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT id, version_major, version_minor, version_label, content_hash,
              change_reason, storage_path, created_at
       FROM school_packet_org_versions
       WHERE school_organization_id = ? AND locale = ?
       ORDER BY version_major DESC, version_minor DESC`,
      [sid, loc]
    );
    return rows || [];
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[printable-packet] listSchoolPacketVersionHistory failed:', e?.message || e);
    }
    return [];
  }
}

/**
 * Finds a version row by its human-readable label for a given school+locale.
 * Used when agency staff enter the version label from a signed paper packet.
 */
export async function findSchoolPacketVersionByLabel(schoolOrganizationId, locale, versionLabel) {
  const sid = Number(schoolOrganizationId || 0);
  const loc = normalizeLocale(locale || 'en');
  const raw = String(versionLabel || '').trim();
  const canonical = canonicalSchoolPacketVersionLabel(raw);
  const parsed = parseSchoolPacketVersionLabel(raw);
  if (!sid || !raw || !(await orgVersionsTableExists())) return null;
  try {
    const hasStaffCol = await columnExists('school_packet_org_versions', 'staff_json');
    const [rows] = await pool.execute(
      `SELECT id, version_major, version_minor, version_label, content_hash, providers_json, storage_path, created_at
              ${hasStaffCol ? ', staff_json' : ''}
       FROM school_packet_org_versions
       WHERE school_organization_id = ? AND locale = ?
         AND (
           version_label = ?
           OR version_label = ?
           OR (? IS NOT NULL AND version_label = ?)
           OR (? IS NOT NULL AND version_major = ? AND version_minor = ?)
         )
       ORDER BY id DESC
       LIMIT 1`,
      [
        sid, loc,
        raw,
        canonical || raw,
        canonical, canonical,
        parsed, parsed?.major ?? null, parsed?.minor ?? null
      ]
    );
    return rows?.[0] || null;
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[printable-packet] findSchoolPacketVersionByLabel failed:', e?.message || e);
    }
    return null;
  }
}

/**
 * Returns the current (latest) version label for a school, or the agency-level
 * fallback label. Used to display the version in the portal without triggering a
 * full packet render.
 */
export async function getCurrentSchoolPacketVersionLabel(schoolOrganizationId, locale = 'en', fallbackLabel = '1.0') {
  const sid = Number(schoolOrganizationId || 0);
  const loc = normalizeLocale(locale);
  if (!sid || !(await orgVersionsTableExists())) return fallbackLabel;
  try {
    const [rows] = await pool.execute(
      `SELECT version_label
       FROM school_packet_org_versions
       WHERE school_organization_id = ? AND locale = ?
       ORDER BY version_major DESC, version_minor DESC
       LIMIT 1`,
      [sid, loc]
    );
    return rows?.[0]?.version_label || fallbackLabel;
  } catch {
    return fallbackLabel;
  }
}

async function findCacheRow(schoolOrganizationId, locale) {
  const sid = Number(schoolOrganizationId || 0);
  const loc = normalizeLocale(locale);
  if (!sid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT id, school_organization_id, locale, content_hash, storage_path, byte_size, generated_at
       FROM school_printable_packet_cache
       WHERE school_organization_id = ? AND locale = ?
       LIMIT 1`,
      [sid, loc]
    );
    return rows?.[0] || null;
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
}

async function upsertCacheRow({ schoolOrganizationId, locale, contentHash, storagePath, byteSize }) {
  const sid = Number(schoolOrganizationId || 0);
  const loc = normalizeLocale(locale);
  await pool.execute(
    `INSERT INTO school_printable_packet_cache
       (school_organization_id, locale, content_hash, storage_path, byte_size, generated_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       content_hash = VALUES(content_hash),
       storage_path = VALUES(storage_path),
       byte_size = VALUES(byte_size),
       generated_at = NOW()`,
    [sid, loc, contentHash, storagePath, byteSize || null]
  );
}

async function readCachedPdf(row) {
  if (!row?.storage_path) return null;
  try {
    const buf = await StorageService.readObject(row.storage_path);
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } catch {
    return null;
  }
}

async function storeCachedPdf({ schoolOrganizationId, locale, contentHash, pdfBytes }) {
  const sid = Number(schoolOrganizationId || 0);
  const loc = normalizeLocale(locale);
  const key = `uploads/school_printable_packets/school_${sid}/${loc}-${contentHash.slice(0, 16)}.pdf`;
  await StorageService.writeObject(key, Buffer.from(pdfBytes), 'application/pdf', {
    schoolOrganizationId: String(sid),
    locale: loc,
    contentHash
  });
  try {
    await upsertCacheRow({
      schoolOrganizationId: sid,
      locale: loc,
      contentHash,
      storagePath: key,
      byteSize: pdfBytes.length
    });
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[printable-packet] cache row save failed:', e.message);
    }
  }
  return key;
}

async function renderAndStore(schoolOrganizationId, locale) {
  const packetContext = await buildSchoolPrintablePacketContext({
    organizationId: schoolOrganizationId,
    locale
  });
  const contentHash = schoolPrintablePacketContentHash(packetContext);

  // Resolve (or create) the per-school version for this exact content hash.
  // The label is stamped into the packet footer so the printed version label
  // precisely identifies which roster the family signed.
  const agencyMajor = resolveAgencyPacketMajorVersion(packetContext.brand?.versionLabel);
  const versionRow = await getOrCreateSchoolPacketVersion(
    schoolOrganizationId,
    locale,
    contentHash,
    null,
    packetContext.providers || [],
    Number(packetContext.version || 1) || null,
    packetContext.staffRows || [],
    agencyMajor
  );
  if (versionRow?.version_label) {
    packetContext.packetVersionLabel = versionRow.version_label;
    if (packetContext.brand) {
      packetContext.brand.versionLabel = versionRow.version_label;
    }
  }

  const existing = await findCacheRow(schoolOrganizationId, locale);
  if (existing?.content_hash === contentHash) {
    const cached = await readCachedPdf(existing);
    if (cached?.length) return cached;
  }
  const pdfBytes = await generateSchoolPrintablePacketPdf(packetContext);
  let storedPath = null;
  try {
    storedPath = await storeCachedPdf({
      schoolOrganizationId,
      locale,
      contentHash,
      pdfBytes
    });
  } catch (e) {
    console.warn('[printable-packet] storage cache skipped:', e.message);
  }
  // Persist the GCS path back to the version row so admins can download it later.
  if (versionRow?.id && storedPath) {
    void saveVersionStoragePath(versionRow.id, storedPath);
  }
  return pdfBytes;
}

export async function getOrCreateSchoolPrintablePacketPdf(schoolOrganizationId, locale = 'en') {
  const loc = normalizeLocale(locale);
  const key = cacheKey(schoolOrganizationId, loc);
  if (inflight.has(key)) return inflight.get(key);

  const job = renderAndStore(schoolOrganizationId, loc).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

export function warmSchoolPrintablePacketCache(schoolOrganizationId, locales = ['en', 'es']) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return;
  for (const locale of locales) {
    void getOrCreateSchoolPrintablePacketPdf(sid, locale).catch((e) => {
      console.warn(`[printable-packet] warm ${sid}/${locale} failed:`, e.message);
    });
  }
}

/** Regenerate cached PDFs (and version rows) for every school under an agency. */
export async function warmAgencyPrintablePacketCaches(agencyId, locales = ['en', 'es']) {
  const aid = Number(agencyId || 0);
  if (!aid) return;
  try {
    const schools = await AgencySchool.listByAgency(aid);
    for (const row of schools || []) {
      const sid = Number(row.school_organization_id || 0);
      if (sid > 0) warmSchoolPrintablePacketCache(sid, locales);
    }
  } catch (e) {
    console.warn('[printable-packet] agency warm failed:', e?.message || e);
  }
}

export async function invalidateSchoolPrintablePacketCache(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return;
  try {
    await pool.execute(
      'DELETE FROM school_printable_packet_cache WHERE school_organization_id = ?',
      [sid]
    );
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[printable-packet] cache invalidate failed:', e.message);
    }
  }
}

export async function invalidateAgencyPrintablePacketCaches(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return;
  try {
    const schools = await AgencySchool.listByAgency(aid);
    const ids = (schools || [])
      .map((row) => Number(row.school_organization_id || 0))
      .filter((id) => id > 0);
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    await pool.execute(
      `DELETE FROM school_printable_packet_cache WHERE school_organization_id IN (${placeholders})`,
      ids
    );
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[printable-packet] agency cache invalidate failed:', e.message);
    }
  }
}
