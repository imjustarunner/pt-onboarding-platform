/**
 * Computed Client Renewal need flags for roster / Compliance Corner.
 */
import pool from '../config/database.js';
import { isRoiExpired } from '../models/ClientSchoolStaffRoiAccess.model.js';
import {
  computeCurrentSchoolYearLabel,
  normalizeSchoolYearLabel,
  previousSchoolYearLabel
} from '../utils/schoolYear.js';
import {
  sqlUnicodeLiteral,
  sqlUnicodeNe,
  sqlNonEmpty
} from '../utils/mysqlCollation.js';

const ROLE_IS_SCHOOL_STAFF = sqlUnicodeLiteral("LOWER(COALESCE(u.role, ''))", 'school_staff');
const STATUS_NOT_ARCHIVED = sqlUnicodeNe("UPPER(COALESCE(u.status, ''))", "'ARCHIVED'");
const EMAIL_MATCH = `LOWER(TRIM(COALESCE(sc.email, ''))) = LOWER(TRIM(COALESCE(u.email, '')))`;
const WORK_EMAIL_MATCH = `LOWER(TRIM(COALESCE(sc.email, ''))) = LOWER(TRIM(COALESCE(u.work_email, '')))`;

const SCHEDULER_CONTACT_EXISTS = `
  SELECT 1
  FROM school_contacts sc
  WHERE sc.school_organization_id = ua.agency_id
    AND (
      (${sqlNonEmpty('u.email')} AND ${EMAIL_MATCH})
      OR (${sqlNonEmpty('u.work_email')} AND ${WORK_EMAIL_MATCH})
    )
    AND COALESCE(sc.is_scheduler, 0) = 1`;

function toBool(value) {
  return value === true || value === 1 || value === '1';
}

function emptyFlags() {
  return {
    expiredRoi: false,
    schoolTransfer: false,
    staffRoiGap: false,
    reactivatedNeedsPacket: false,
    any: false,
    recommended: {
      verifyContact: true,
      smartRoi: false,
      smartDisclosure: false,
      fullPacket: false,
      packetMode: 'school'
    }
  };
}

function buildRecommended(flags) {
  const recommended = {
    verifyContact: true,
    smartRoi: !!(flags.expiredRoi || flags.schoolTransfer || flags.staffRoiGap),
    smartDisclosure: !!flags.schoolTransfer,
    fullPacket: !!flags.reactivatedNeedsPacket,
    packetMode: 'school'
  };
  return recommended;
}

function finalizeFlags(partial) {
  const flags = {
    expiredRoi: !!partial.expiredRoi,
    schoolTransfer: !!partial.schoolTransfer,
    staffRoiGap: !!partial.staffRoiGap,
    reactivatedNeedsPacket: !!partial.reactivatedNeedsPacket
  };
  flags.any = flags.expiredRoi || flags.schoolTransfer || flags.staffRoiGap || flags.reactivatedNeedsPacket;
  flags.recommended = buildRecommended(flags);
  return flags;
}

function matchesRenewalFlagFilter(flags, filterRaw) {
  const filter = String(filterRaw || '').trim().toLowerCase().replace(/-/g, '_');
  if (!filter || filter === 'all' || filter === 'none') return true;
  if (filter === 'any') return !!flags?.any;
  if (filter === 'expired_roi' || filter === 'expired') return !!flags?.expiredRoi;
  if (filter === 'school_transfer' || filter === 'transfer') return !!flags?.schoolTransfer;
  if (filter === 'staff_roi_gap' || filter === 'staff_gap') return !!flags?.staffRoiGap;
  if (filter === 'reactivated' || filter === 'reactivated_needs_packet' || filter === 'full_packet') {
    return !!flags?.reactivatedNeedsPacket;
  }
  return true;
}

/**
 * Batch-compute renewal flags for client rows (must include id, organization_id,
 * school_year, roi_expires_at, needs_full_packet_renewal when available).
 */
export async function computeRenewalFlagsForClients(clientRows = []) {
  const rows = Array.isArray(clientRows) ? clientRows : [];
  const byId = new Map();
  for (const row of rows) {
    const id = Number(row?.id || row?.client_id || 0);
    if (!id) continue;
    byId.set(id, {
      id,
      organization_id: Number(row.organization_id || 0) || null,
      school_year: normalizeSchoolYearLabel(row.school_year) || null,
      roi_expires_at: row.roi_expires_at ?? null,
      needs_full_packet_renewal: toBool(row.needs_full_packet_renewal)
    });
  }

  const ids = [...byId.keys()];
  const result = new Map();
  for (const id of ids) {
    const c = byId.get(id);
    result.set(id, {
      expiredRoi: isRoiExpired(c.roi_expires_at),
      schoolTransfer: false,
      staffRoiGap: false,
      reactivatedNeedsPacket: c.needs_full_packet_renewal
    });
  }
  if (!ids.length) return result;

  const currentYear = computeCurrentSchoolYearLabel();
  const priorYear = previousSchoolYearLabel(currentYear);
  const placeholders = ids.map(() => '?').join(',');

  // Dual-year membership
  const yearMembers = new Map(); // clientId -> Set(years)
  try {
    const [yearRows] = await pool.execute(
      `SELECT client_id, school_year
       FROM client_school_years
       WHERE client_id IN (${placeholders})
         AND school_year IN (?, ?)`,
      [...ids, currentYear, priorYear]
    );
    for (const r of yearRows || []) {
      const cid = Number(r.client_id);
      if (!yearMembers.has(cid)) yearMembers.set(cid, new Set());
      const label = normalizeSchoolYearLabel(r.school_year);
      if (label) yearMembers.get(cid).add(label);
    }
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  // Prior (inactive) school assignment — latest updated inactive row per client
  const priorOrgByClient = new Map();
  try {
    const [coaRows] = await pool.execute(
      `SELECT coa.client_id, coa.organization_id, coa.updated_at
       FROM client_organization_assignments coa
       WHERE coa.client_id IN (${placeholders})
         AND COALESCE(coa.is_active, 0) = 0
       ORDER BY coa.updated_at DESC, coa.organization_id DESC`,
      ids
    );
    for (const r of coaRows || []) {
      const cid = Number(r.client_id);
      if (priorOrgByClient.has(cid)) continue;
      priorOrgByClient.set(cid, Number(r.organization_id) || null);
    }
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  for (const id of ids) {
    const c = byId.get(id);
    const years = yearMembers.get(id) || new Set();
    if (c.school_year) years.add(c.school_year);
    const onCurrent = years.has(currentYear) || c.school_year === currentYear;
    const hadPrior = years.has(priorYear);
    const priorOrg = priorOrgByClient.get(id) || null;
    const currentOrg = c.organization_id;
    if (onCurrent && hadPrior && priorOrg && currentOrg && priorOrg !== currentOrg) {
      result.get(id).schoolTransfer = true;
    }
  }

  // Staff ROI grant gaps (partial coverage)
  const staffGapIds = new Set();
  try {
    const [gapRows] = await pool.execute(
      `SELECT DISTINCT c.id AS client_id
       FROM clients c
       WHERE c.id IN (${placeholders})
         AND c.organization_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM client_school_staff_roi_access a
           WHERE a.client_id = c.id
             AND a.school_organization_id = c.organization_id
             AND COALESCE(a.is_active, 0) = 1
         )
         AND EXISTS (
           SELECT 1
           FROM user_agencies ua
           JOIN users u ON u.id = ua.user_id
           WHERE ua.agency_id = c.organization_id
             AND ${ROLE_IS_SCHOOL_STAFF}
             AND COALESCE(u.is_active, TRUE) = TRUE
             AND ${STATUS_NOT_ARCHIVED}
             AND NOT EXISTS (${SCHEDULER_CONTACT_EXISTS})
             AND NOT EXISTS (
               SELECT 1
               FROM client_school_staff_roi_access a2
               WHERE a2.client_id = c.id
                 AND a2.school_organization_id = c.organization_id
                 AND a2.school_staff_user_id = u.id
                 AND COALESCE(a2.is_active, 0) = 1
             )
         )`,
      ids
    );
    for (const r of gapRows || []) {
      const cid = Number(r.client_id);
      if (cid) staffGapIds.add(cid);
    }
  } catch (e) {
    // Fallback without scheduler exclusion if school_contacts schema differs
    const msg = String(e?.message || '').toLowerCase();
    if (
      e?.code === 'ER_BAD_FIELD_ERROR'
      || e?.code === 'ER_NO_SUCH_TABLE'
      || msg.includes('school_contacts')
      || msg.includes('is_scheduler')
      || msg.includes('collation')
    ) {
      const [gapRows] = await pool.execute(
        `SELECT DISTINCT c.id AS client_id
         FROM clients c
         WHERE c.id IN (${placeholders})
           AND c.organization_id IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM client_school_staff_roi_access a
             WHERE a.client_id = c.id
               AND a.school_organization_id = c.organization_id
               AND COALESCE(a.is_active, 0) = 1
           )
           AND EXISTS (
             SELECT 1
             FROM user_agencies ua
             JOIN users u ON u.id = ua.user_id
             WHERE ua.agency_id = c.organization_id
               AND ${ROLE_IS_SCHOOL_STAFF}
               AND COALESCE(u.is_active, TRUE) = TRUE
               AND ${STATUS_NOT_ARCHIVED}
               AND NOT EXISTS (
                 SELECT 1
                 FROM client_school_staff_roi_access a2
                 WHERE a2.client_id = c.id
                   AND a2.school_organization_id = c.organization_id
                   AND a2.school_staff_user_id = u.id
                   AND COALESCE(a2.is_active, 0) = 1
               )
           )`,
        ids
      );
      for (const r of gapRows || []) {
        const cid = Number(r.client_id);
        if (cid) staffGapIds.add(cid);
      }
    } else {
      throw e;
    }
  }

  for (const id of staffGapIds) {
    if (result.has(id)) result.get(id).staffRoiGap = true;
  }

  // Finalize recommended + any
  for (const [id, partial] of result.entries()) {
    result.set(id, finalizeFlags(partial));
  }
  return result;
}

export function attachRenewalFlagsToClients(clients, flagsById) {
  return (clients || []).map((c) => {
    const id = Number(c?.id || 0);
    const flags = flagsById?.get(id) || finalizeFlags({
      expiredRoi: isRoiExpired(c?.roi_expires_at),
      schoolTransfer: false,
      staffRoiGap: false,
      reactivatedNeedsPacket: toBool(c?.needs_full_packet_renewal)
    });
    return { ...c, renewalFlags: flags };
  });
}

export function filterClientsByRenewalFlag(clients, filterRaw) {
  const filter = String(filterRaw || '').trim().toLowerCase();
  if (!filter || filter === 'all' || filter === 'none' || filter === '') return clients;
  return (clients || []).filter((c) => matchesRenewalFlagFilter(c.renewalFlags, filter));
}

export { emptyFlags, finalizeFlags, matchesRenewalFlagFilter, buildRecommended };

export async function clearNeedsFullPacketRenewal(clientId) {
  const cid = Number(clientId || 0);
  if (!cid) return;
  try {
    await pool.execute(
      `UPDATE clients
       SET needs_full_packet_renewal = 0
       WHERE id = ? AND needs_full_packet_renewal <> 0`,
      [cid]
    );
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') return;
    throw e;
  }
}

export async function setNeedsFullPacketRenewal(clientId, value = true) {
  const cid = Number(clientId || 0);
  if (!cid) return;
  try {
    await pool.execute(
      `UPDATE clients
       SET needs_full_packet_renewal = ?
       WHERE id = ?`,
      [value ? 1 : 0, cid]
    );
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') return;
    throw e;
  }
}
