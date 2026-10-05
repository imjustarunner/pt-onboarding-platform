// Only product-generated records tickets get a clinical-queue shortcut.
export function recordsRequestQueueUrl(ticket) {
  if (ticket?.created_by_source_key !== 'auricwell_records_request') return '';
  const match = String(ticket.question || '').match(/https:\/\/plottwisthq\.com\/records-manager\?agencyId=\d+&request=[0-9a-f-]{36}(?=\s|$)/);
  return match?.[0] || '';
}
