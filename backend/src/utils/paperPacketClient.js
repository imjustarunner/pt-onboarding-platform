/**
 * True when the client was created via school paper-packet upload (not digital intake / admin).
 */
export function isPaperPacketClient(client) {
  if (!client) return false;
  const source = String(client.source || '').toUpperCase();
  if (source === 'SCHOOL_UPLOAD' || source === 'SCHOOL_UPLOAD_INTERNAL') return true;
  // Legacy rows created before source was reliable.
  if (String(client.status || '').toUpperCase() === 'PACKET') return true;
  if (String(client.document_status || '').toUpperCase() === 'PACKET') return true;
  return false;
}
