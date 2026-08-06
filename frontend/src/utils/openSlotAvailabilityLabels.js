/**
 * Per-tenant-type wording for open-slot availability flags.
 * Extensible: add practitionerType keys as needed. Defaults are generic.
 */
export function openSlotAvailabilityLabels(practitionerType = '') {
  const t = String(practitionerType || '').trim().toLowerCase();
  // Hook for future type-specific copy (coach, tutor, therapist, …).
  if (t === 'coach' || t === 'life_coach') {
    return {
      intake: 'Available for new clients',
      session: 'Available for current clients'
    };
  }
  if (t === 'tutor' || t === 'tutoring') {
    return {
      intake: 'Available for new students',
      session: 'Available for current students'
    };
  }
  return {
    intake: 'Available for intake (new clients)',
    session: 'Available for session (current clients)'
  };
}
