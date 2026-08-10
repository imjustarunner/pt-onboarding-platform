/**
 * True when the client was created via school paper-packet upload.
 */
export function isPaperPacketClient(client) {
  if (!client) return false;
  if (client.is_paper_packet === true || client.is_paper_packet === 1) return true;
  const source = String(client.source || '').toUpperCase();
  if (source === 'SCHOOL_UPLOAD' || source === 'SCHOOL_UPLOAD_INTERNAL') return true;
  if (String(client.status || '').toUpperCase() === 'PACKET') return true;
  if (String(client.document_status || '').toUpperCase() === 'PACKET') return true;
  return false;
}
