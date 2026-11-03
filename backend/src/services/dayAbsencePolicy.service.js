// Shared by booked appointments and pre-EHR school schedule notices.
export const DAY_ABSENCE_EXPLANATION = 'This session is displaying due to SCHOOL soft schedule. It does not currently reflect an EHR session. You may cancel your day and your clients/guardians will be notified by email. Use urgent Cancel day for weather, sickness, or unexpected absences.';

export function dayAbsenceMessage({ urgent = true, providerName = 'Your provider', schoolName, date, when, reason }) {
  if (!urgent) return {
    subject: 'Your care team has canceled an upcoming session',
    text: `Your care team has canceled an upcoming session${when ? ` on ${when}` : date ? ` on ${date}` : ''}. Please log in to your client portal to see any upcoming changes to your schedule.`
  };
  return {
    subject: `Session canceled — ${date || when}`,
    text: `I will not be ${schoolName ? `at ${schoolName}` : 'available for our session'} on ${when || date}, so our session is canceled.\n\nReason: ${reason}\n\n${providerName}`
  };
}
