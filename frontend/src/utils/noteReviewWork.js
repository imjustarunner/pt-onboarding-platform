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

// Older amendment notices ended with JSON. Present the saved values as readable
// lines without changing the original request or its acknowledgement state.
export function readableReviewMessage(message) {
  const text=String(message || ''), lines=text.split('\n');
  try {
    const data=JSON.parse(lines.at(-1));
    if (!data || typeof data!=='object' || !('durationMinutes' in data) || !('startTime' in data)) return text;
    const fields=[['participants','Participants'],['durationMinutes','Duration (minutes)'],['startTime','Start'],['endTime','End'],['locationLabel','Location'],['placeOfService','Place of service']];
    return [...lines.slice(0,-1),...fields.filter(([key])=>data[key]!=null&&data[key]!=='').map(([key,label])=>`${label}: ${data[key]}`),...(typeof data.patientPresent==='boolean'?[`Patient present: ${data.patientPresent?'Yes':'No'}`]:[])].join('\n');
  } catch { return text; }
}
