function isEnrollmentReceiptFile(doc) {
  const mime = String(doc?.mime_type || '').toLowerCase();
  if (mime.includes('text/plain') || mime.includes('text/html')) return false;
  if (mime.includes('pdf')) return true;
  const name = String(doc?.original_name || doc?.document_title || '').toLowerCase();
  if (name.endsWith('.pdf')) return true;
  return !mime && /intake packet|intake responses/i.test(String(doc?.document_type || ''));
}

export function enrollmentReceiptCards(docs) {
  return (Array.isArray(docs) ? docs : [])
    .filter(isEnrollmentReceiptFile)
    .map((doc) => ({
      id: `receipt-${doc.id}`,
      kind: 'packet',
      kindLabel: 'Signed enrollment',
      title: doc.document_title || doc.document_type || 'Enrollment receipt',
      viewKey: `receipt-${doc.id}`,
      missing: false,
      signedAt: doc.created_at || doc.uploaded_at || null,
      available: true
    }));
}
