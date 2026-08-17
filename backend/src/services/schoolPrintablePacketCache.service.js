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

const inflight = new Map();

function cacheKey(schoolOrganizationId, locale) {
  return `${Number(schoolOrganizationId)}:${normalizeLocale(locale)}`;
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
  const existing = await findCacheRow(schoolOrganizationId, locale);
  if (existing?.content_hash === contentHash) {
    const cached = await readCachedPdf(existing);
    if (cached?.length) return cached;
  }
  const pdfBytes = await generateSchoolPrintablePacketPdf(packetContext);
  try {
    await storeCachedPdf({
      schoolOrganizationId,
      locale,
      contentHash,
      pdfBytes
    });
  } catch (e) {
    console.warn('[printable-packet] storage cache skipped:', e.message);
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
