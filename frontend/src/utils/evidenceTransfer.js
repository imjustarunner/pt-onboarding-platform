export function transferDescription(value) {
  let transfer = value;
  if (typeof transfer === 'string') { try { transfer = JSON.parse(transfer); } catch { return ''; } }
  if (!transfer || typeof transfer !== 'object') return '';
  if (transfer.bodyPermitted === false) return 'No response body was sent.';
  if (transfer.partial) {
    const range = Number.isSafeInteger(transfer.rangeStart) && Number.isSafeInteger(transfer.rangeEnd)
      ? ` Bytes ${transfer.rangeStart.toLocaleString()}–${transfer.rangeEnd.toLocaleString()}${Number.isSafeInteger(transfer.resourceBytes) ? ` of ${transfer.resourceBytes.toLocaleString()}` : ''}.` : '';
    return `Partial file response.${range} This does not establish delivery of the whole file.`;
  }
  return '';
}

export function evidenceLabel(value) {
  return ({ file_metadata: 'File metadata request', metadata_only: 'Metadata only', not_modified: 'Cache check — no new file data', no_content: 'No response content', redirected: 'Redirected', response_sent: 'Response sent', issued: 'Link issued' })[value] || String(value || '').replaceAll('_', ' ');
}
