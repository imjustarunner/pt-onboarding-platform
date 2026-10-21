/** Keep a saved draft distinct from a copay that still needs staff review. */
export function noteDraftAttendanceNotice(attendance) {
  if (attendance?.needsReview) {
    return `Your draft is saved. Attendance or copay needs review. ${attendance.message || 'Check the session status before continuing.'}`;
  }
  if (attendance?.collection?.needsReview) {
    return attendance.collection.reason === 'late_attendance'
      ? 'Your draft is saved. This session is from an earlier date, so the copay was held for billing review instead of charging on a different day.'
      : 'Your draft is saved. The copay was held for billing review; it was not automatically collected.';
  }
  return '';
}
