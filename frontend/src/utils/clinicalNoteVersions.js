// Keep the stored clinical payload intact while editing its narrative fields.
export const cloneRevisionValue = value => value == null ? value : JSON.parse(JSON.stringify(value));

export function revisionNarrativeFields(payload) {
  let value = payload;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch { return [{ key: 'narrative', label: 'Note narrative', value, path: [] }]; }
  }
  if (!value || typeof value !== 'object') return [];
  const source = value.sections && typeof value.sections === 'object' && !Array.isArray(value.sections) ? value.sections : value;
  const prefix = source === value ? [] : ['sections'];
  return Object.entries(source).filter(([key, entry]) => typeof entry === 'string' && !['meta', 'metadata'].includes(key.toLowerCase())).map(([key, entry]) => ({ key, label: key.replace(/_/g, ' '), value: entry, path: [...prefix, key] }));
}

export function revisedNarrativePayload(payload, fields) {
  if (fields.length === 1 && fields[0].path.length === 0) return fields[0].value;
  let value = cloneRevisionValue(payload);
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return value; }
  }
  for (const field of fields) {
    let target = value;
    for (const key of field.path.slice(0, -1)) target = target[key];
    target[field.path.at(-1)] = field.value;
  }
  return value;
}

export const revisionStatusLabel = status => ({
  original: 'Original signed record', draft: 'Amendment draft', awaiting_author_signature: 'Awaiting original author signature',
  awaiting_supervisor_signature: 'Awaiting responsible supervisor signature', awaiting_author_acknowledgement: 'Awaiting original author acknowledgement',
  approved: 'Approved', superseded: 'Superseded amendment'
}[status] || String(status || 'Status unavailable').replace(/_/g, ' '));

export const revisionSignatureLabel = action => ({
  initial_author_sign: 'Original author signature', initial_supervisor_sign: 'Original supervisor signature',
  author_sign: 'Original clinical author signature', supervisor_sign: 'Responsible supervisor signature', author_acknowledge: 'Original author acknowledgement'
}[action] || 'Recorded signature');
