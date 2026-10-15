export function supervisionSpeakerLabel(user, role = 'Supervisee') {
  const name = [String(user?.preferred_name || '').trim() || user?.first_name, user?.last_name]
    .filter(Boolean).join(' ').trim();
  return name ? `${role} · ${name}` : role;
}

// Repair legacy speaker labels only. Numbers elsewhere in a transcript are evidence.
export function normalizeSupervisionSpeakerLabels(text, participants = []) {
  const byId = new Map(participants.map(user => [String(user.id), user]));
  return String(text || '').replace(/\b(Supervisor|Supervisee)\s*[·|]\s*(?:user-)?(\d+)\b/gi,
    (_match, role, id) => supervisionSpeakerLabel(byId.get(id), /^supervisor$/i.test(role) ? 'Supervisor' : 'Supervisee'));
}
