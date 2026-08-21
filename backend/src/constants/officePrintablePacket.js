export const OFFICE_PRINTABLE_PACKET_VERSION = '1.0';

export const OFFICE_PACKET_VARIANTS = Object.freeze({
  SELF: 'self',
  PARENT: 'parent'
});

export function normalizeOfficePacketVariant(value) {
  const raw = String(value || 'self').trim().toLowerCase();
  if (raw === 'parent' || raw === 'guardian' || raw === 'dependent' || raw === 'child') {
    return OFFICE_PACKET_VARIANTS.PARENT;
  }
  return OFFICE_PACKET_VARIANTS.SELF;
}

export function officePacketTitle(variant, locale = 'en') {
  const isParent = normalizeOfficePacketVariant(variant) === OFFICE_PACKET_VARIANTS.PARENT;
  const isEs = String(locale || 'en').toLowerCase().startsWith('es');
  if (isParent) {
    return isEs ? 'Paquete de Inscripción para Padre/Tutor' : 'Parent/Guardian Enrollment Packet';
  }
  return isEs ? 'Paquete de Inscripción del Cliente' : 'Client Enrollment Packet';
}
