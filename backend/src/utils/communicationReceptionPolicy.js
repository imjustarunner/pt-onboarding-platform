export function isCommunicationStaffActive(user) {
  if (!user) return false;
  const status = String(user.status || '').toUpperCase();
  return ![false, 0, '0'].includes(user.is_active)
    && ![true, 1, '1'].includes(user.is_archived)
    && !user.terminated_at
    && !['TERMINATED', 'TERMINATED_PENDING', 'ARCHIVED', 'INACTIVE_EMPLOYEE'].includes(status);
}

// Unknown is not the same as spam. Never discard a possible new family based on keywords.
export function receptionReason({ blocked = false, known = false, ambiguous = false, departed = false, directMismatch = false, mainNumber = false }) {
  if (blocked) return 'blocked_sender';
  if (ambiguous) return 'ambiguous_identity';
  if (!known) return 'unknown_sender';
  if (departed) return 'departed_provider';
  if (directMismatch) return 'unapproved_for_provider';
  if (mainNumber) return 'main_number_inquiry';
  return null;
}

export function isLikelyAdvertising(body) {
  // Deliberately narrow. Ordinary links, appointment questions and insurance language
  // do not establish spam. Only unknown senders are classified this way.
  const text=String(body || '').toLowerCase();
  return /\b(we (offer|provide|specialize)|our (services|agency)|i (offer|provide))\b/.test(text)
    && /\b(seo services|search engine optimization|buy leads|lead generation services|website ranking|google rankings)\b/.test(text);
}
