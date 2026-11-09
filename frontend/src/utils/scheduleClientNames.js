export const normalizeClientNameDisplay = value => ['hidden', 'initials', 'full'].includes(value) ? value : 'full';

export function scheduleClientInitials(name) {
  const text = String(name || '').trim();
  if (!text || /^client\s*#?\s*\d+$/i.test(text)) return '';
  // Support both First Last and Last, First without displaying any full token.
  const parts = (text.includes(',') ? text.split(',').reverse().join(' ') : text).split(/\s+/).filter(Boolean);
  return [parts[0], parts.length > 1 ? parts.at(-1) : null]
    .filter(Boolean).map(part => Array.from(part)[0].toLocaleUpperCase()).join('');
}

/** Only project calendar copy. Canonical client data and appointment IDs stay intact for the editor. */
export function scheduleClientFace(block, mode, timeLabel = '') {
  const display = normalizeClientNameDisplay(mode);
  // Imported calendar titles are unstructured; their client identity cannot be
  // reliably separated from the title, so privacy modes use a neutral label.
  if (display !== 'full' && block.kind === 'gevt') {
    const label = ['Google event', block.allDay ? 'All day' : timeLabel].filter(Boolean).join(' · ');
    return { ...block, shortLabel: label, title: label };
  }
  const clinical = block.isClientSession || block.clientId || block.kind === 'school-soft'
    || ['session', 'external'].includes(block.peerActivityType);
  if (!clinical || display === 'full') return { ...block, displayClientName: block.clientName };
  const initials = display === 'initials' ? scheduleClientInitials(block.clientName) : '';
  const name = initials || 'Client';
  const state = block.isCancelled ? 'Canceled' : block.isMissed ? 'Missed' : '';
  const label = [state, `${name} session`].filter(Boolean).join(' · ');
  const location = block.schoolName || block.locationLabel || '';
  return {
    ...block,
    displayClientName: name,
    shortLabel: [label, timeLabel || block.timeLabel, location].filter(Boolean).join('\n'),
    title: [label, block.allDay ? 'All day' : timeLabel || block.timeLabel, location].filter(Boolean).join(' · '),
    // Free text can contain names even when structured client fields do not.
    schedulingNoteSnippet: ''
  };
}
