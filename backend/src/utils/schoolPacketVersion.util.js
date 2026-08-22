/**
 * School paper-packet version labels.
 *
 * One printed version per school, monotonic within a major generation:
 *   - major = agency print major (from agencies.packet_version_label, e.g. 1 or 2)
 *   - minor = per-school revision; +1 on every packet content change
 *
 * Disclosure (agency template) and school ROI (staff/providers) both bump minor by 1.
 * Only the school whose roster/template changed gets a new row; other schools keep
 * their current label until they change.
 *
 * Examples:
 *   1.0   first packet
 *   1.01  disclosure update (all schools when re-rendered)
 *   1.02  second disclosure (all schools)
 *   1.03  school A ROI only; school B stays 1.02
 *   1.04  next disclosure — school A (was 1.03), school B (was 1.02 → 1.03)
 *   2.0   agency major bump (HIPAA overhaul); minor resets, then 2.01, 2.02…
 */

/** @param {number} major */
/** @param {number} minor */
export function formatSchoolPacketVersionLabel(major, minor) {
  const m = Math.max(1, Number(major || 1));
  const n = Math.max(0, Number(minor || 0));
  if (n === 0) return `${m}.0`;
  const minorStr = n < 10 ? `0${n}` : String(n);
  return `${m}.${minorStr}`;
}

/**
 * Parse a footer / OCR version string into numeric major + minor.
 * @returns {{ major: number, minor: number } | null}
 */
export function parseSchoolPacketVersionLabel(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/(?:version|ver\.?|v\.?)?\s*(\d+)\.(\d+)\b/i);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * Agency print major from packet_version_label (defaults to 1).
 * @param {string|null|undefined} agencyPacketVersionLabel
 */
export function resolveAgencyPacketMajorVersion(agencyPacketVersionLabel) {
  const parsed = parseSchoolPacketVersionLabel(agencyPacketVersionLabel);
  return Math.max(1, parsed?.major ?? 1);
}

/**
 * Canonical label for DB lookup (handles 1.1 vs 1.01 equivalence).
 * @param {string} raw
 * @returns {string | null}
 */
export function canonicalSchoolPacketVersionLabel(raw) {
  const parsed = parseSchoolPacketVersionLabel(raw);
  if (!parsed) return null;
  return formatSchoolPacketVersionLabel(parsed.major, parsed.minor);
}

function parseJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortedIds(rows, idKeys) {
  return [...new Set(
    (rows || [])
      .map((row) => {
        for (const key of idKeys) {
          const id = Number(row?.[key] || 0);
          if (id > 0) return id;
        }
        return 0;
      })
      .filter((id) => id > 0)
  )].sort((a, b) => a - b);
}

/**
 * Infer why a new content hash was created (stored on school_packet_org_versions.change_reason).
 */
export function inferPacketChangeReason({
  latestRow = null,
  agencyMajorVersion = 1,
  templateVersionSnapshot = 1,
  providers = [],
  staffRows = []
} = {}) {
  if (!latestRow) return 'initial';

  const agencyMajor = Math.max(1, Number(agencyMajorVersion || 1));
  const rowMajor = Number(latestRow.version_major || 1);
  if (agencyMajor > rowMajor) return 'major_document_updated';

  const newTemplate = Number(templateVersionSnapshot || 1);
  const prevTemplate = Number(latestRow.template_version_snapshot || 1);
  if (newTemplate > prevTemplate) return 'disclosure_updated';

  const prevProviders = parseJsonArray(latestRow.providers_json);
  const prevStaff = parseJsonArray(latestRow.staff_json);
  const providerIds = sortedIds(providers, ['id', 'userId', 'user_id']);
  const prevProviderIds = sortedIds(prevProviders, ['id', 'userId', 'user_id']);
  if (JSON.stringify(providerIds) !== JSON.stringify(prevProviderIds)) {
    return 'provider_roster_updated';
  }

  const staffIds = sortedIds(staffRows, ['school_staff_user_id', 'id', 'user_id', 'schoolStaffUserId']);
  const prevStaffIds = sortedIds(prevStaff, ['school_staff_user_id', 'id', 'user_id', 'schoolStaffUserId']);
  if (JSON.stringify(staffIds) !== JSON.stringify(prevStaffIds)) {
    return 'staff_roster_updated';
  }

  return 'content_updated';
}

/**
 * Compute the next version for a new content hash at one school.
 *
 * - Agency major bump (packet_version_label 1.x → 2.x): reset school to 2.0
 * - Any other content change: keep major, minor + 1 (1.01, 1.02, 1.03…)
 */
export function computeNextSchoolPacketVersion(latestRow, agencyMajorVersion = 1) {
  const agencyMajor = Math.max(1, Number(agencyMajorVersion || 1));

  if (!latestRow) {
    return {
      major: agencyMajor,
      minor: 0,
      label: formatSchoolPacketVersionLabel(agencyMajor, 0)
    };
  }

  const rowMajor = Number(latestRow.version_major || 1);
  const rowMinor = Number(latestRow.version_minor || 0);

  if (agencyMajor > rowMajor) {
    return {
      major: agencyMajor,
      minor: 0,
      label: formatSchoolPacketVersionLabel(agencyMajor, 0)
    };
  }

  const minor = rowMinor + 1;
  return {
    major: rowMajor,
    minor,
    label: formatSchoolPacketVersionLabel(rowMajor, minor)
  };
}
