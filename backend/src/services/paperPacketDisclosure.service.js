/**
 * Paper-packet provider disclosure service.
 *
 * Tracks which version label a client's family signed on the physical paper packet
 * and returns three independent compliance flags:
 *
 *  1. roiRenewalNeeded   — ROI expires within 60 days OR is already expired (36-month term)
 *  2. disclosureUpdate   — A currently-assigned provider is not on the signed disclosure version
 *  3. newPacketNeeded    — A major document section changed since the signed version (tenths bump).
 *                          Admins can waive this flag with a written reason.
 *
 * Tracking start date for flags 2 and 3: 2026-08-20.
 * Records confirmed before that date are not subject to those checks.
 */
import pool from '../config/database.js';
import ClientPaperPacketDisclosure from '../models/ClientPaperPacketDisclosure.model.js';
import { findSchoolPacketVersionByLabel } from './schoolPrintablePacketCache.service.js';

/** Earliest date for which mismatch/version checks apply. */
export const PAPER_PACKET_TRACKING_START = new Date('2026-08-20T00:00:00Z');

/** Days before ROI expiry at which the renewal flag turns on. */
const ROI_RENEWAL_WARN_DAYS = 60;

function parseJson(v, fallback = []) {
  if (!v) return fallback;
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysDiff(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// ─── Record creation ──────────────────────────────────────────────────────────

/**
 * Called when agency staff mark a paper packet as received.
 * Records the version label and snapshots the provider list from that version row.
 *
 * @param {object} opts
 * @param {number} opts.clientId
 * @param {number} opts.schoolOrganizationId
 * @param {string} opts.packetVersionLabel  - e.g. "1.02"
 * @param {string} [opts.locale]            - defaults to 'en'
 * @param {number|null} [opts.confirmedByUserId]
 * @returns {Promise<object|null>} the created disclosure record
 */
export async function recordPaperPacketDisclosure({
  clientId,
  schoolOrganizationId,
  packetVersionLabel,
  locale = 'en',
  confirmedByUserId = null
}) {
  const cid = Number(clientId || 0);
  const sid = Number(schoolOrganizationId || 0);
  const label = String(packetVersionLabel || '').trim();
  if (!cid || !sid || !label) return null;

  const versionRow = await findSchoolPacketVersionByLabel(sid, locale, label).catch(() => null);
  const providersSnapshot = versionRow?.providers_json
    ? parseJson(versionRow.providers_json)
    : null;

  return ClientPaperPacketDisclosure.create({
    clientId: cid,
    schoolOrganizationId: sid,
    packetVersionLabel: label,
    schoolPacketOrgVersionId: versionRow?.id || null,
    providersSnapshot,
    confirmedByUserId
  });
}

// ─── Waiver ───────────────────────────────────────────────────────────────────

/**
 * Admin waives the "new packet needed" flag for this client's latest disclosure.
 *
 * @param {object} opts
 * @param {number} opts.clientId
 * @param {string} opts.reason   - required non-empty explanation
 * @param {number} opts.actorUserId
 */
export async function waivePaperPacketNewPacketFlag({ clientId, reason, actorUserId }) {
  const cid = Number(clientId || 0);
  const r = String(reason || '').trim();
  if (!cid) throw Object.assign(new Error('clientId required'), { status: 400 });
  if (!r) throw Object.assign(new Error('A reason is required to waive the new-packet flag'), { status: 400 });

  const disclosure = await ClientPaperPacketDisclosure.findLatestForClient(cid).catch(() => null);
  if (!disclosure) throw Object.assign(new Error('No paper packet disclosure found for this client'), { status: 404 });

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  try {
    await pool.execute(
      `UPDATE client_paper_packet_disclosures
         SET waived_new_packet_at = ?, waived_new_packet_reason = ?, waived_by_user_id = ?
       WHERE id = ?`,
      [now, r, Number(actorUserId) || null, disclosure.id]
    );
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      // Migration 1263 not yet applied — no-op, waiver columns don't exist yet
      console.warn('[paper-packet] waiver columns not yet migrated, skipping waive.');
      return { waived: false, message: 'Waiver columns not yet migrated.' };
    }
    throw e;
  }
  return { waived: true, reason: r, waivedAt: now };
}

// ─── Status check ─────────────────────────────────────────────────────────────

/**
 * Returns three independent compliance flags for a paper-packet client.
 *
 * @returns {Promise<{
 *   tracked: boolean,
 *   versionLabel: string|null,
 *   confirmedAt: Date|null,
 *   templateVersionSnapshot: number|null,
 *
 *   // Flag 1 — ROI expiration
 *   roiRenewalNeeded: boolean,
 *   roiExpiresAt: Date|null,
 *   roiExpiredDaysAgo: number|null,
 *   roiDaysUntilExpiry: number|null,
 *
 *   // Flag 2 — Disclosure update (provider roster mismatch)
 *   disclosureUpdateNeeded: boolean,
 *   missingProviders: Array<{id:number, fullName:string, credential?:string}>,
 *
 *   // Flag 3 — New full packet (major document changed)
 *   newPacketNeeded: boolean,
 *   newPacketReason: string|null,
 *   newPacketWaived: boolean,
 *   newPacketWaivedAt: string|null,
 *   newPacketWaivedReason: string|null,
 *   newPacketWaivedByUserId: number|null,
 *
 *   // Legacy compat
 *   requiresNewPacket: boolean,
 *   allProvidersOnPacket: boolean,
 * }>}
 */
export async function checkPaperPacketDisclosureStatus(clientId) {
  const BASE = {
    tracked: false,
    versionLabel: null,
    confirmedAt: null,
    templateVersionSnapshot: null,
    roiRenewalNeeded: false,
    roiExpiresAt: null,
    roiExpiredDaysAgo: null,
    roiDaysUntilExpiry: null,
    disclosureUpdateNeeded: false,
    missingProviders: [],
    newPacketNeeded: false,
    newPacketReason: null,
    newPacketWaived: false,
    newPacketWaivedAt: null,
    newPacketWaivedReason: null,
    newPacketWaivedByUserId: null,
    requiresNewPacket: false,
    allProvidersOnPacket: true
  };

  const cid = Number(clientId || 0);
  if (!cid) return BASE;

  // ── Fetch client (ROI expiry + assigned providers) ────────────────────────
  let clientRow = null;
  try {
    const [rows] = await pool.execute(
      `SELECT id, organization_id, provider_id, provider_ids, roi_expires_at
       FROM clients WHERE id = ? LIMIT 1`,
      [cid]
    );
    clientRow = rows?.[0] || null;
  } catch { /* ignore */ }
  if (!clientRow) return BASE;

  // ── Flag 1: ROI renewal ───────────────────────────────────────────────────
  let roiRenewalNeeded = false;
  let roiExpiresAt = null;
  let roiExpiredDaysAgo = null;
  let roiDaysUntilExpiry = null;

  if (clientRow.roi_expires_at) {
    roiExpiresAt = new Date(clientRow.roi_expires_at);
    const now = new Date();
    const daysLeft = daysDiff(now, roiExpiresAt);
    if (daysLeft <= 0) {
      roiRenewalNeeded = true;
      roiExpiredDaysAgo = Math.abs(daysLeft);
      roiDaysUntilExpiry = null;
    } else if (daysLeft <= ROI_RENEWAL_WARN_DAYS) {
      roiRenewalNeeded = true;
      roiDaysUntilExpiry = daysLeft;
      roiExpiredDaysAgo = null;
    } else {
      roiDaysUntilExpiry = daysLeft;
    }
  }

  // ── Get latest disclosure record ──────────────────────────────────────────
  const disclosure = await ClientPaperPacketDisclosure.findLatestForClient(cid).catch(() => null);
  if (!disclosure) {
    return {
      ...BASE,
      roiRenewalNeeded,
      roiExpiresAt,
      roiExpiredDaysAgo,
      roiDaysUntilExpiry
    };
  }

  const confirmedAt = disclosure.confirmed_at ? new Date(disclosure.confirmed_at) : null;
  const versionLabel = disclosure.packet_version_label || null;

  // Build waiver fields (columns may not exist in pre-migration envs)
  const newPacketWaived = Boolean(disclosure.waived_new_packet_at);
  const newPacketWaivedAt = disclosure.waived_new_packet_at
    ? String(disclosure.waived_new_packet_at).slice(0, 19)
    : null;
  const newPacketWaivedReason = disclosure.waived_new_packet_reason || null;
  const newPacketWaivedByUserId = Number(disclosure.waived_by_user_id) || null;

  // Only apply tracking-era checks for records confirmed on/after 2026-08-20.
  if (!confirmedAt || confirmedAt < PAPER_PACKET_TRACKING_START) {
    return {
      ...BASE,
      tracked: true,
      versionLabel,
      confirmedAt,
      roiRenewalNeeded,
      roiExpiresAt,
      roiExpiredDaysAgo,
      roiDaysUntilExpiry,
      newPacketWaived,
      newPacketWaivedAt,
      newPacketWaivedReason,
      newPacketWaivedByUserId
    };
  }

  // ── Flag 2: Disclosure update (provider mismatch) ─────────────────────────
  let disclosureUpdateNeeded = false;
  let missingProviders = [];

  const providersSnapshot = Array.isArray(disclosure.providers_snapshot)
    ? disclosure.providers_snapshot
    : [];

  if (providersSnapshot.length) {
    // Assigned provider IDs
    const primary = Number(clientRow.provider_id || 0);
    const multi = String(clientRow.provider_ids || '')
      .split(',').map((s) => Number(s.trim())).filter(Boolean);
    const assignedIds = [...new Set([...(primary ? [primary] : []), ...multi])];

    if (assignedIds.length) {
      const snapshotIds = new Set(
        providersSnapshot
          .map((p) => Number(p.id || p.userId || p.user_id || 0))
          .filter(Boolean)
      );
      const missingIds = assignedIds.filter((id) => !snapshotIds.has(id));

      if (missingIds.length) {
        disclosureUpdateNeeded = true;
        try {
          const placeholders = missingIds.map(() => '?').join(',');
          const [users] = await pool.execute(
            `SELECT id, first_name, last_name, credential FROM users WHERE id IN (${placeholders})`,
            missingIds
          );
          missingProviders = (users || []).map((u) => ({
            id: Number(u.id),
            fullName: `${String(u.first_name || '').trim()} ${String(u.last_name || '').trim()}`.trim()
              || `Provider #${u.id}`,
            credential: u.credential || null
          }));
        } catch {
          missingProviders = missingIds.map((id) => ({ id, fullName: `Provider #${id}` }));
        }
      }
    }
  }

  // ── Flag 3: New full packet needed (major document change) ────────────────
  let newPacketNeeded = false;
  let newPacketReason = null;
  let templateVersionSnapshot = null;

  const sid = Number(clientRow.organization_id || 0);
  if (sid && disclosure.school_packet_org_version_id) {
    try {
      // Look up the tenths counter on both signed and current version.
      const [versionRows] = await pool.execute(
        `SELECT id,
                COALESCE(version_tenths, 0) AS version_tenths,
                COALESCE(template_version_snapshot, 1) AS template_version_snapshot
         FROM school_packet_org_versions
         WHERE id = ? OR (school_organization_id = ? AND locale = 'en')
         ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, version_major DESC, version_minor DESC
         LIMIT 5`,
        [disclosure.school_packet_org_version_id, sid, disclosure.school_packet_org_version_id]
      );
      const signedRow = versionRows.find((r) => r.id === disclosure.school_packet_org_version_id);
      const latestRow = versionRows.find((r) => r.id !== disclosure.school_packet_org_version_id)
        || versionRows[versionRows.length - 1];

      if (signedRow) templateVersionSnapshot = Number(signedRow.template_version_snapshot);

      if (signedRow && latestRow && signedRow.id !== latestRow.id) {
        const signedTenths = Number(signedRow.version_tenths || 0);
        const currentTenths = Number(latestRow.version_tenths || 0);
        if (currentTenths > signedTenths) {
          newPacketNeeded = true;
          newPacketReason = `A major document section was updated after v${versionLabel} was signed (template revision ${signedRow.template_version_snapshot} → ${latestRow.template_version_snapshot}). A new paper packet must be printed and signed.`;
        }
      }
    } catch { /* version columns may not exist yet */ }
  }

  // If waived, suppress the flag but keep the reason visible.
  const newPacketActive = newPacketNeeded && !newPacketWaived;

  return {
    tracked: true,
    versionLabel,
    confirmedAt,
    templateVersionSnapshot,
    roiRenewalNeeded,
    roiExpiresAt,
    roiExpiredDaysAgo,
    roiDaysUntilExpiry,
    disclosureUpdateNeeded,
    missingProviders,
    newPacketNeeded,
    newPacketReason,
    newPacketWaived,
    newPacketWaivedAt,
    newPacketWaivedReason,
    newPacketWaivedByUserId,
    // Legacy compat
    requiresNewPacket: disclosureUpdateNeeded || newPacketActive,
    allProvidersOnPacket: !disclosureUpdateNeeded
  };
}
