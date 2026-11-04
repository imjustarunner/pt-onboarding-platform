const isEnrollmentPacket = (link) => {
  const type = String(link?.form_type || 'intake').trim().toLowerCase();
  return !!String(link?.public_key || '').trim()
    && (link?.is_active == null || Number(link.is_active) === 1)
    && ['intake', 'public_form'].includes(type);
};

/** The API chooses the school's current packet; other active forms are not alternatives. */
export function selectSchoolEnrollmentLink({ link, links } = {}) {
  if (isEnrollmentPacket(link)) return link;
  const packets = (Array.isArray(links) ? links : []).filter(isEnrollmentPacket);
  const english = packets.filter((packet) => !String(packet.language_code || 'en').toLowerCase().startsWith('es'));
  const inherited = english.filter((packet) => Number(packet.inherits_school_master) === 1);
  const candidates = inherited.length ? inherited : english.length ? english : packets;
  return candidates.find((packet) => /enrollment|referral packet|paquete de referencia|school referral/i.test(String(packet.title || '')))
    || candidates[0] || null;
}
