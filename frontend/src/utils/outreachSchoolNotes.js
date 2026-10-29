// A school keeps its history across trips. Trip-wide context is labelled separately.
export function outreachSchoolNotes(school = {}) {
  const items = (school.feed || []).filter(item => item.entry_type !== 'task' && String(item.body || '').trim())
    .map(item => ({ ...item, created_at: item.occurred_at,
      sourceLabel: item.source === 'historical_import' ? 'From spreadsheet' : null,
      activityLabel: item.title || null }));
  for (const note of school.notes || []) {
    if (!items.some(item => Number(item.note_id) === Number(note.id))) items.push({
      ...note, id: `note-${note.id}`, note_id: note.id,
      sourceLabel: note.source === 'historical_import' ? 'From spreadsheet' : null,
      activityLabel: note.spoken_with_name ? `Spoke with ${note.spoken_with_name}` : null
    });
  }
  if (String(school.general_notes || '').trim()) items.push({ id: 'school-general', body: school.general_notes, activityLabel: 'School information' });
  return items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}
