import pool from '../config/database.js';
import { companyEventAgencyIds, listCompanyEventStaff, resolveCompanyEventAudienceUserIds } from './companyEventAudience.service.js';
import { canManageEventConversation } from './companyEventConversation.service.js';
import { isActiveTeamMember } from './conversaTeamRecipients.service.js';

const config = poll => {
  const raw = poll.votingConfig || poll.voting_config_json || {};
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
};
export const linkedCompanyEventId = poll => Number(config(poll).linkedEventId) || null;
const ordinary = event => event && !['team_poll','direct_notice','skills_group','guardian_program_class'].includes(event.event_type)
  && !/^(school_|program_)/.test(event.event_type || '');

/** Parent invitation and poll audience both apply, including after either is edited. */
export async function linkedCompanyEventPollAudience({ poll, audience = null, db = pool }) {
  const linkedId = linkedCompanyEventId(poll);
  if (!linkedId) return null;
  const agencyId = Number(poll.agency_id || poll.agencyId);
  const [[parent]] = await db.execute('SELECT * FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1', [linkedId, agencyId]);
  if (!ordinary(parent) || !Number(parent.is_active) || ['canceled','cancelled'].includes(parent.school_event_status)) {
    return { parent: null, userIds: [], users: [], invitedAgencyIds: [] };
  }
  const parentIds = new Set(await resolveCompanyEventAudienceUserIds({ event: parent, db }));
  const agencyIds = companyEventAgencyIds(parent);
  const candidatePoll = { ...poll, agency_id: agencyId, operations_json: { invitedAgencyIds: agencyIds.filter(id => id !== agencyId) } };
  const chosenIds = new Set(await resolveCompanyEventAudienceUserIds({ event: candidatePoll, audience, db }));
  const users = (await listCompanyEventStaff(agencyIds, db)).filter(user => isActiveTeamMember(user) && parentIds.has(Number(user.id)) && chosenIds.has(Number(user.id)));
  return { parent, userIds: users.map(user => Number(user.id)), users, invitedAgencyIds: agencyIds.filter(id => id !== agencyId) };
}

export async function validateLinkedCompanyEventPoll({ agencyId, parsed, actor = null, eventId = null, db = pool }) {
  const linkedId = linkedCompanyEventId(parsed);
  if (!linkedId) return null;
  const [[parent]] = await db.execute('SELECT * FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1', [linkedId, agencyId]);
  if (!parsed.votingConfig?.enabled || linkedId === Number(eventId) || !ordinary(parent) || !Number(parent.is_active)
    || ['canceled','cancelled'].includes(parent.school_event_status)) {
    throw Object.assign(new Error('Link this vote to an active company event in the same host agency.'), { status: 400 });
  }
  if (actor && !await canManageEventConversation(parent, actor, db)) {
    throw Object.assign(new Error('You need event management access to create or change its votes.'), { status: 403 });
  }
  const parentIds = new Set(await resolveCompanyEventAudienceUserIds({ event: parent, db }));
  if ((parsed.audience?.userIds || []).some(id => !parentIds.has(Number(id)))) {
    throw Object.assign(new Error('Votes can include only the company event’s current invited people.'), { status: 400 });
  }
  return { parent, invitedAgencyIds: companyEventAgencyIds(parent).filter(id => id !== Number(agencyId)) };
}
