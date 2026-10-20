export function finalizedUpdateProgress(recipient) {
  if (recipient.status !== 'finalized' || !recipient.finalized_at) return null;
  let snapshot = recipient.snapshot_json;
  if (typeof snapshot === 'string') {
    try { snapshot = JSON.parse(snapshot); } catch { return null; }
  }
  if (!Array.isArray(snapshot?.enabledKeys) || !Array.isArray(snapshot?.sections)) return null;
  const keys = [...new Set(snapshot.enabledKeys)];
  const completed = new Set(snapshot.sections.filter(section => Number(section.completed) === 1).map(section => section.section_key));
  return { completed: keys.filter(key => completed.has(key)).length, total: keys.length };
}
