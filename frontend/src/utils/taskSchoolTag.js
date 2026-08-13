/** School name chip on outreach-tagged tasks. */
export function taskSchoolTag(task) {
  if (!task) return '';
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : null;
  return String(
    task.school_tag
    || task.outreach_school_name
    || meta?.schoolName
    || ''
  ).trim();
}

export function taskOutreachSchoolId(task) {
  if (!task) return null;
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : null;
  const n = Number(task.outreach_school_id || meta?.outreachSchoolId || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}
