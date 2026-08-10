/** Smart printable school referral packet (agency-templated). */

export const SCHOOL_PRINTABLE_PACKET_VERSION = '1.15';

/** Demo schools where the packet is always available for preview/testing. */
export const SCHOOL_PRINTABLE_PACKET_DEMO_SLUGS = new Set(['hogwarts', 'durmstrang']);

export const SCHOOL_PRINTABLE_PACKET_VIRTUAL_DOC_ID = 'smart-printable-packet';

export function resolveOrganizationSlug(org = {}) {
  return String(org?.portal_url || org?.slug || '').trim().toLowerCase();
}

/** Fantasy/demo identities excluded from live roster tables (not from portal access). */
export function isHogwartsDemoSchoolOrg(org = {}) {
  const slug = resolveOrganizationSlug(org);
  if (SCHOOL_PRINTABLE_PACKET_DEMO_SLUGS.has(slug)) return true;
  const name = String(org?.name || '').trim().toLowerCase();
  return /\bhogwarts\b|\bdurmstrang\b/.test(name);
}

/**
 * Enabled for school/program/learning orgs (real schools + Hogwarts/Durmstrang demo).
 * Demo people are filtered out of generated roster content, not the Docs/Links entry.
 */
export function isSchoolPrintablePacketEnabled(org = {}) {
  const orgType = String(org?.organization_type || 'school').trim().toLowerCase();
  return ['school', 'program', 'learning'].includes(orgType);
}

export function buildVirtualPrintablePacketDocument({
  schoolOrganizationId,
  org = {},
  templateVersion = null,
  updatedAt = null
} = {}) {
  const schoolName = String(org?.name || 'School').trim();
  const nowIso = new Date().toISOString();
  return {
    id: SCHOOL_PRINTABLE_PACKET_VIRTUAL_DOC_ID,
    school_organization_id: Number(schoolOrganizationId || 0) || null,
    kind: 'system_printable_packet',
    title: `${schoolName} — School Packet (Smart)`,
    category_key: 'referral_packet',
    file_path: null,
    link_url: null,
    mime_type: 'application/pdf',
    original_filename: null,
    uploaded_by_user_id: null,
    created_at: nowIso,
    updated_at: updatedAt || nowIso,
    packet_version: templateVersion != null
      ? String(templateVersion)
      : SCHOOL_PRINTABLE_PACKET_VERSION,
    packet_content_version: SCHOOL_PRINTABLE_PACKET_VERSION,
    is_virtual: true
  };
}
