function isEnrollmentReceiptFile(doc) {
  const mime = String(doc?.mime_type || '').toLowerCase();
  if (mime.includes('text/plain') || mime.includes('text/html')) return false;
  if (mime.includes('pdf')) return true;
  const name = String(doc?.original_name || doc?.document_title || '').toLowerCase();
  if (name.endsWith('.pdf')) return true;
  return !mime && /intake packet|intake responses/i.test(String(doc?.document_type || ''));
}

// Charts created before November 5, 2026 stored the older "Intake" titles.
function receiptTitle(doc) {
  const raw = String(doc?.document_title || doc?.document_type || '').trim();
  if (/^intake packet\b/i.test(raw)) return raw.replace(/^intake packet/i, 'Enrollment Packet');
  if (/^intake responses\b/i.test(raw)) return raw.replace(/^intake responses/i, 'Enrollment Responses');
  return raw || 'Enrollment receipt';
}

export function enrollmentReceiptCards(docs) {
  return (Array.isArray(docs) ? docs : [])
    .filter(isEnrollmentReceiptFile)
    .map((doc) => ({
      id: `receipt-${doc.id}`,
      kind: 'packet',
      kindLabel: 'Signed enrollment',
      title: receiptTitle(doc),
      viewKey: `receipt-${doc.id}`,
      missing: false,
      signedAt: doc.created_at || doc.uploaded_at || null,
      available: true
    }));
}
