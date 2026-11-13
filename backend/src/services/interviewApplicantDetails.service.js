import Agency from '../models/Agency.model.js';

// Explicit applicant DTO: never return the staff workspace or agency settings.
export async function interviewApplicantDetails({ event, interview }) {
  const agency = await Agency.findById(event.agency_id);
  const rawLogo = String(agency?.logo_url || '');
  const logoUrl = /^https:\/\//.test(rawLogo) || /^\/assets\//.test(rawLogo) ? rawLogo : '';
  return {
    agency: { name: agency?.name || '', slug: agency?.slug || '', logoUrl },
    meeting: { startsAt: event.start_at, endsAt: event.end_at, timezone: interview.interview_timezone || event.event_timezone || 'America/Denver' }
  };
}
