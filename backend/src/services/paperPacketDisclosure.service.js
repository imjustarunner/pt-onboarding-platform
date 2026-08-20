/**
 * Paper-packet provider disclosure service.
 *
 * Tracks which version label a client's family signed on the physical paper packet
 * and flags when the client's currently assigned provider wasn't on that roster.
 *
 * Tracking start date: 2026-08-20.
 * Records confirmed before that date are not subject to the mismatch check.
 */
import pool from '../config/database.js';
import ClientPaperPacketDisclosure from '../models/ClientPaperPacketDisclosure.model.js';
import { findSchoolPacketVersionByLabel } from './schoolPrintablePacketCache.service.js';

/** Earliest date for which the mismatch check applies. */
export const PAPER_PACKET_TRACKING_START = new Date('2026-08-20T00:00:00Z');

function parseJson(v, fallback = []) {
  if (!v) return fallback;
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

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

  // Try to find the version row for this school + label.
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

/**
 * Checks whether the client's currently assigned provider(s) were on the
 * paper packet disclosure they signed.
 *
 * Only applies when:
 *  - the client has a paper packet disclosure record
 *  - confirmed_at >= PAPER_PACKET_TRACKING_START (2026-08-20)
 *  - the record has a providers_snapshot
 *
 * @returns {Promise<{
 *   tracked: boolean,
 *   versionLabel: string|null,
 *   confirmedAt: Date|null,
 *   allProvidersOnPacket: boolean,
 *   missingProviders: Array<{id:number, fullName:string}>,
 *   requiresNewPacket: boolean
 * }>}
 */
export async function checkPaperPacketDisclosureStatus(clientId) {
  const NOT_TRACKED = {
    tracked: false,
    versionLabel: null,
    confirmedAt: null,
    allProvidersOnPacket: true,
    missingProviders: [],
    requiresNewPacket: false
  };

  const cid = Number(clientId || 0);
  if (!cid) return NOT_TRACKED;

  const disclosure = await ClientPaperPacketDisclosure.findLatestForClient(cid).catch(() => null);
  if (!disclosure) return NOT_TRACKED;

  const confirmedAt = disclosure.confirmed_at ? new Date(disclosure.confirmed_at) : null;
  if (!confirmedAt || confirmedAt < PAPER_PACKET_TRACKING_START) return NOT_TRACKED;
  if (!Array.isArray(disclosure.providers_snapshot) || !disclosure.providers_snapshot.length) {
    // Version recorded but no provider snapshot — can't compare
    return { ...NOT_TRACKED, tracked: true, versionLabel: disclosure.packet_version_label, confirmedAt };
  }

  // Get the client's assigned provider IDs.
  let assignedProviderIds = [];
  try {
    const [rows] = await pool.execute(
      `SELECT provider_id, provider_ids FROM clients WHERE id = ? LIMIT 1`,
      [cid]
    );
    const row = rows?.[0];
    if (row) {
      const primary = Number(row.provider_id || 0);
      const multi = String(row.provider_ids || '').split(',').map((s) => Number(s.trim())).filter(Boolean);
      assignedProviderIds = [...new Set([...(primary ? [primary] : []), ...multi])];
    }
  } catch {
    assignedProviderIds = [];
  }

  if (!assignedProviderIds.length) {
    // No provider assigned yet — nothing to flag
    return { ...NOT_TRACKED, tracked: true, versionLabel: disclosure.packet_version_label, confirmedAt };
  }

  // Build a set of provider IDs that were on the signed version.
  const snapshotIds = new Set(
    disclosure.providers_snapshot
      .map((p) => Number(p.id || p.userId || p.user_id || 0))
      .filter(Boolean)
  );

  // Find which assigned providers are NOT in the snapshot.
  const missingIds = assignedProviderIds.filter((id) => !snapshotIds.has(id));

  let missingProviders = [];
  if (missingIds.length) {
    try {
      const placeholders = missingIds.map(() => '?').join(',');
      const [users] = await pool.execute(
        `SELECT id, first_name, last_name FROM users WHERE id IN (${placeholders})`,
        missingIds
      );
      missingProviders = (users || []).map((u) => ({
        id: Number(u.id),
        fullName: `${String(u.first_name || '').trim()} ${String(u.last_name || '').trim()}`.trim() || `Provider #${u.id}`
      }));
    } catch {
      missingProviders = missingIds.map((id) => ({ id, fullName: `Provider #${id}` }));
    }
  }

  return {
    tracked: true,
    versionLabel: disclosure.packet_version_label,
    confirmedAt,
    allProvidersOnPacket: missingProviders.length === 0,
    missingProviders,
    requiresNewPacket: missingProviders.length > 0
  };
}
