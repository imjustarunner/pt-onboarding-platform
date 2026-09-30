import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import Notification from '../models/Notification.model.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { listClinicalFacetsForUsers } from './providerClinicalFacets.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { isNotificationChannelEnabled } from './notificationPreferences.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { matchesExchangeListing } from '../utils/clientExchangeMatching.js';

export async function notifyExchangeMatches({ listing, client }) {
  const agencyId = Number(listing.agencyId);
  const [users] = await pool.execute(`SELECT DISTINCT u.* FROM users u
    JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
    WHERE COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0
      AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING')
      AND (u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant') OR u.has_provider_access = 1)`, [agencyId]);
  const facets = await listClinicalFacetsForUsers(users.map(u => u.id), { agencyId });
  const agency = await Agency.findById(agencyId);
  const identities = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: false, onlyActive: true });
  const sender = identities.find(row => row.identity_key === 'notifications')
    || identities.find(row => /^notifications@/i.test(row.from_email || ''));
  const link = `${buildPublicAppUrl(agency, 'client-exchange')}?listingId=${listing.id}&agencyId=${agencyId}`;
  const summary = { matched: 0, sent: 0, queued: 0, skipped: 0, failed: 0 };
  for (const user of users) {
    if (Number(user.id) === Number(listing.currentProviderUserId)) continue;
    try {
      const profile = await Profile.getForProvider({ providerUserId: user.id, agencyId });
      if (!matchesExchangeListing({ user, profile, facets: facets.get(Number(user.id)), listing, client })) continue;
      summary.matched++;
      await Notification.create({
        type: 'client_exchange_match', severity: 'info', title: 'New Client Exchange match',
        message: 'A new referral matches your client preferences. Open the exchange to review and request it.',
        userId: user.id, agencyId, relatedEntityType: 'client_exchange_listing', relatedEntityId: listing.id,
        actorUserId: listing.postedByUserId, actorSource: 'client_exchange',
        audienceJson: { agencySlug: agency?.slug || agency?.portal_url }
      });
      const enabled = await isNotificationChannelEnabled({ userId: user.id, userRole: user.role, agencyId, type: 'client_exchange_match', channel: 'email' });
      if (!enabled) { summary.skipped++; continue; }
      const to = user.work_email || user.email || user.personal_email;
      if (!sender?.id || !to) { summary.failed++; continue; }
      const result = await sendEmailFromIdentity({
        senderIdentityId: sender.id, to, userId: user.id, source: 'auto',
        subject: 'New Client Exchange match',
        text: `A new referral matches your client preferences. Sign in to review the listing and request this client:\n\n${link}`,
        templateType: 'client_exchange_match', linkUrl: link, fromDisplayNameOverride: 'Notifications'
      });
      if (result?.skipped || result?.blocked) summary.failed++;
      else if (result?.queued) summary.queued++;
      else summary.sent++;
    } catch (error) {
      summary.failed++;
      console.error('[clientExchange] Match notification failed', { listingId: listing.id, userId: user.id, error: error?.message });
    }
  }
  return summary;
}
