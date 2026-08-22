/**
 * True when the client was created via school paper-packet upload.
 */
const PAPER_SOURCES = new Set(['SCHOOL_UPLOAD', 'SCHOOL_UPLOAD_INTERNAL']);
const DIGITAL_INTAKE_SOURCES = new Set([
  'PUBLIC_INTAKE_LINK',
  'DIGITAL_FORM',
  'PUBLIC_OFFICE_INTAKE',
  'ADAPTIVE_QUICK_PROSPECTIVE',
  'PUBLIC_BOOKING_INQUIRY'
]);

function normalizeSource(client) {
  return String(client?.source || '').trim().toUpperCase();
}

export function isPaperPacketClient(client) {
  if (!client) return false;
  if (client.is_paper_packet === true || client.is_paper_packet === 1) return true;
  const source = normalizeSource(client);

  if (PAPER_SOURCES.has(source)) return true;
  if (DIGITAL_INTAKE_SOURCES.has(source) || source.includes('INTAKE')) return false;

  const status = String(client.status || '').toUpperCase();
  const documentStatus = String(client.document_status || '').toUpperCase();
  if (!source && (status === 'PACKET' || documentStatus === 'PACKET')) return true;
  return false;
}
