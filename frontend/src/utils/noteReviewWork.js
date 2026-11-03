export const NOTE_REVIEW_STATUS = {
  changes_needed: 'Changes needed',
  review_acknowledge: 'Review / acknowledge needed',
  feedback: 'Feedback'
};

export function groupNoteReviewWork(items = []) {
  const groups = new Map();
  const priority = { changes_needed: 0, review_acknowledge: 1, feedback: 2 };
  for (const item of items) {
    if (!NOTE_REVIEW_STATUS[item.status] || item.acknowledgedAt || item.dismissedAt || item.resolvedAt) continue;
    const key = `${item.agencyId}:${item.clinicalNoteId}`;
    const existing = groups.get(key);
    if (!existing) groups.set(key, { ...item, id: `review_${key}`, requests: [item] });
    else {
      existing.requests.push(item);
      if (priority[item.status] < priority[existing.status]) {
        existing.status = item.status;
        existing.message = item.message;
      }
    }
  }
  return [...groups.values()].sort((a, b) => priority[a.status] - priority[b.status]
    || String(a.date || '').localeCompare(String(b.date || '')));
}
