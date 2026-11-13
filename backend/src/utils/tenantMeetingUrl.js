import Agency from '../models/Agency.model.js';
import { buildPublicPortalBaseUrl } from './publicPortalUrl.js';
import { interviewJoinUrl } from './interviewJoinUrl.js';

// Resolve from the event's persisted agency, never the requesting host or caller input.
export async function tenantMeetingBase(agencyId) {
  if (!Number(agencyId)) throw new Error('A meeting must belong to an agency.');
  const agency = await Agency.findById(Number(agencyId));
  if (!agency) throw new Error('Meeting agency not found.');
  return buildPublicPortalBaseUrl(agency);
}

export async function tenantInterviewJoinUrl(agencyId, token) {
  const agency = await Agency.findById(Number(agencyId));
  const url = agency && interviewJoinUrl(agency.slug, token);
  if (!url) throw new Error('The interview agency and invitation token are required.');
  return url;
}
