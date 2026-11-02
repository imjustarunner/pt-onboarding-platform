import { loadExchangeWaivers } from './clientExchangeWaivers.service.js';
import { listExchangeShares } from './clientExchangeSharing.service.js';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import { getListingForMatching } from './clientExchange.service.js';
import { loadExchangeCandidates, evaluateExchangeCandidate } from './clientExchangeCandidates.service.js';
import { eligibleExchangeProvider } from '../utils/clientExchangeProvider.js';

/** Read-only evaluation for an already tenant-authorized support request. Sends no notifications. */
export async function currentExchangeAudit(audit, agencyId) {
  const listing = await getListingForMatching(audit.listingId);
  if (!listing || Number(listing.agencyId) !== Number(agencyId)) throw Object.assign(new Error('Forbidden'), { status: 403 });
  const client = await Client.findById(listing.clientId);
  if (!client || Number(client.agency_id) !== Number(agencyId)) throw Object.assign(new Error('Forbidden'), { status: 403 });
  const agency = await Agency.findById(agencyId);
  const { users, facets } = await loadExchangeCandidates(agencyId);
  const providers = [];
  const eligible = users.filter(user => eligibleExchangeProvider(user, agency));
  // Keep a bounded number of reads moving; one slow calendar must not hold up
  // the next whole batch of providers. No matching results are cached across edits.
  let next = 0;
  async function worker() {
    while (next < eligible.length) {
      const index = next++;
      const user = eligible[index];
      const previous = audit.providers.find(row => Number(row.userId) === Number(user.id));
      let decision;
      try { decision = await evaluateExchangeCandidate({ user, agency, listing, client, facets: facets.get(Number(user.id)) }); }
      catch { decision = { matched: false, canRequest: false, canAssign: false, checks: [{ field: 'evaluation', status: 'unknown', reason: 'Provider matching could not be checked. Refresh to retry.' }], blockers: [{ code: 'evaluation', message: 'Provider matching could not be checked. Refresh to retry.' }] }; }
      providers[index] = { ...previous, userId: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(' '),
        email: user.work_email || user.email, ...decision, views: previous?.views || 0 };
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, eligible.length) }, worker));
  const [waivers, shares] = await Promise.all([loadExchangeWaivers({ listingId: listing.id, includeRevoked: true }), listExchangeShares(listing.id)]);
  return { ...audit, providers, waivers, shares, canReview: ['open', 'requested'].includes(listing.status), matchesEvaluatedAt: new Date().toISOString() };
}
