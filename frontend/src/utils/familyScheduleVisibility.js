/** Display preference only; the backend remains the authority for busy time and privacy. */
export function familyScheduleProjection(rows, mode, details = {}) {
  return (rows || []).flatMap(row => {
    const personal = row.kind === 'PERSONAL_EVENT' && !row.clientId && !row.client_id
      && !/client\s*id:|platform counseling/i.test(row.description || '')
      && !/^virtual session/i.test(row.title || '');
    if (!personal || mode === 'existing') return [row];
    if (mode === 'hidden') return [];
    if (mode === 'busy') return [{ ...row, title: 'Personal event', description: null }];
    const family = details[row.id];
    if (!family) return [row];
    let metadata = family.metadata || {};
    if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch { metadata = {}; } }
    return [{ ...row, title: family.title, description: [metadata.address, metadata.notes, metadata.equipment && `Bring: ${metadata.equipment}`].filter(Boolean).join('\n') }];
  });
}
