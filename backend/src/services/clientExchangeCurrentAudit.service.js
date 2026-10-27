import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import { getListingForMatching } from './clientExchange.service.js';
import { loadExchangeCandidates, evaluateExchangeCandidate } from './clientExchangeCandidates.service.js';
import { allowQaExchangeRecipient } from '../utils/auricwellQaPolicy.js';

/** Read-only evaluation for an already tenant-authorized support request. Sends no notifications. */
export async function currentExchangeAudit(audit, agencyId) {
  const listing = await getListingForMatching(audit.listingId);
  if (!listing || Number(listing.agencyId) !== Number(agencyId)) throw Object.assign(new Error('Forbidden'), { status: 403 });
  const client = await Client.findById(listing.clientId);
  if (!client || Number(client.agency_id) !== Number(agencyId)) throw Object.assign(new Error('Forbidden'), { status: 403 });
  const agency = await Agency.findById(agencyId);
  const { users, facets } = await loadExchangeCandidates(agencyId);
  const providers = [];
  for (const user of users) {
    if (!allowQaExchangeRecipient(agency, user)) continue;
    const previous = audit.providers.find(row => Number(row.userId) === Number(user.id));
    const decision = await evaluateExchangeCandidate({ user, listing, client, facets: facets.get(Number(user.id)) });
    providers.push({ ...previous, userId: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(' '),
      email: user.work_email || user.email, ...decision, views: previous?.views || 0 });
  }
  return { ...audit, providers, matchesEvaluatedAt: new Date().toISOString() };
}
