import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import Notification from '../models/Notification.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { exchangeStaffRole } from '../../../frontend/src/navigation/clientExchangePolicy.js';
import { loadExchangeProvider } from './clientExchangeEligibility.service.js';
import { withExchangeLock, parseAuditJson } from './clientExchangeAudit.service.js';
import { appendStaffHtmlSignature } from './staffHtmlEmailSignature.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const mapShare = row => ({ id: Number(row.id), providerUserId: Number(row.provider_user_id), providerName: row.provider_name,
  sharedByName: row.shared_by_name, sharedByUserId: Number(row.shared_by_user_id), shareNumber: row.share_number,
  status: row.status, delivery: parseAuditJson(row.delivery_json), createdAt: row.created_at });

export async function listExchangeShares(listingId) {
  const [rows] = await pool.execute(`SELECT s.*, CONCAT_WS(' ', u.first_name, u.last_name) AS provider_name,
    CONCAT_WS(' ', actor.first_name, actor.last_name) AS shared_by_name FROM client_exchange_shares s
    JOIN users u ON u.id = s.provider_user_id JOIN users actor ON actor.id = s.shared_by_user_id
    WHERE s.listing_id = ? ORDER BY s.id DESC`, [listingId]);
  return rows.map(mapShare);
}

async function shareContext({ listingId, agencyId, providerUserId, actor }) {
  if (!exchangeStaffRole(actor?.role)) throw fail('Agency staff access is required', 403);
  const [[listing]] = await pool.execute('SELECT * FROM client_exchange_listings WHERE id = ?', [listingId]);
  if (!listing || Number(listing.agency_id) !== Number(agencyId)) throw fail('Listing not found', 404);
  if (!['open', 'requested'].includes(listing.status)) throw fail('This client is no longer available on the exchange');
  if (listing.target_provider_user_id && Number(listing.target_provider_user_id) !== Number(providerUserId)) throw fail('This direct referral can only be shared with its intended recipient', 403);
  const client = await Client.findById(listing.client_id);
  if (!client || Number(client.agency_id) !== Number(agencyId) || ['ARCHIVED', 'DECLINED'].includes(String(client.status || '').toUpperCase())) throw fail('This client is no longer available on the exchange');
  const { user } = await loadExchangeProvider({ userId: providerUserId, agencyId });
  if (!user) throw fail('Choose an active provider in this agency', 403);
  const to = user.work_email || user.email;
  if (!to) throw fail('This provider has no email address');
  const agency = await Agency.findById(agencyId);
  const shares = await listExchangeShares(listingId);
  const previous = shares.filter(s => s.providerUserId === Number(providerUserId) && ['sent', 'queued', 'redirected', 'sending', 'unknown'].includes(s.status));
  const link = `${buildPublicAppUrl(agency, 'client-exchange')}?listingId=${Number(listingId)}&agencyId=${Number(agencyId)}`;
  const repeat = previous.length > 0;
  const greeting = `Hi ${user.first_name || 'there'},`;
  const introduction = repeat
    ? 'We wanted to bring this client back to your attention. They are still available, and your support team has shared them with you again from the Client Exchange.'
    : 'Your support team has shared a client from the Client Exchange with you. We would love for you to take a look.';
  const subject = repeat ? 'Still available: a client shared by your support team' : 'Your support team has shared a client with you';
  const closing = 'Open the referral to review the client’s preferences and your match details. If you are interested, you can request the client there. The support team will review any fit differences before assignment. Sharing this referral does not change your match status or insurance requirements.';
  // Keep client details in the authenticated exchange. The recipient and signer are server-resolved.
  const text = `${greeting}\n\n${introduction}\n\nReferral #${listingId}\n\n${closing}\n\nView this client: ${link}\n\nThank you for considering this client!`;
  const html = `<p>${escape(greeting)}</p><p>${escape(introduction)}</p><p>Referral #${Number(listingId)}</p><p>${escape(closing)}</p><p><a href="${escape(link)}">View this client in Client Exchange</a></p><p>Thank you for considering this client!</p>`;
  const signed = await appendStaffHtmlSignature({ userId: actor.id, agencyId, text, html, force: true });
  if (!signed.appended) throw fail('Your staff signature could not be loaded. Refresh your profile before sharing.');
  return { listing, agency, user, to, subject, text: signed.text, html: signed.html, link, previousShareCount: previous.length };
}

export async function previewExchangeShare(input) {
  const context = await shareContext(input);
  return { providerUserId: context.user.id, to: context.to, subject: context.subject, text: context.text,
    previousShareCount: context.previousShareCount };
}

export async function sendExchangeShare(input) {
  const { listingId, providerUserId, actor, requestKey, expectedShareCount } = input;
  if (!exchangeStaffRole(actor?.role)) throw fail('Agency staff access is required', 403);
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(String(requestKey || ''))) throw fail('A valid share request key is required', 400);
  return withExchangeLock(listingId, async () => {
    const [[existing]] = await pool.execute('SELECT * FROM client_exchange_shares WHERE listing_id = ? AND shared_by_user_id = ? AND request_key = ?', [listingId, actor.id, requestKey]);
    if (existing) {
      if (Number(existing.provider_user_id) !== Number(providerUserId)) throw fail('This share request belongs to a different provider');
      return { share: mapShare(existing), duplicate: true };
    }
    const context = await shareContext(input);
    if (expectedShareCount !== context.previousShareCount) throw fail('Sharing history changed. Preview the email again before sending.');
    const identities = await EmailSenderIdentity.list({ agencyId: input.agencyId, includePlatformDefaults: false, onlyActive: true });
    const sender = identities.find(i => i.identity_key === 'client_exchange') || identities.find(i => i.identity_key === 'notifications');
    if (!sender?.id) throw fail('The Client Exchange email sender is not configured');
    const [insert] = await pool.execute(`INSERT INTO client_exchange_shares (listing_id, provider_user_id, shared_by_user_id, request_key, share_number)
      VALUES (?, ?, ?, ?, ?)`, [listingId, providerUserId, actor.id, requestKey, context.previousShareCount + 1]);
    const shareId = insert.insertId;
    let result;
    try {
      result = await sendEmailFromIdentity({ senderIdentityId: sender.id, to: context.to, userId: providerUserId, source: 'manual',
        generatedByUserId: actor.id, subject: context.subject, text: context.text, html: context.html,
        templateType: 'client_exchange_shared', linkUrl: context.link,
        internetMessageIdOverride: `<client-exchange-share-${shareId}@${String(sender.from_email).split('@')[1]}>` });
    } catch {
      result = { status: 'unknown', reason: 'Email delivery could not be confirmed. Check communication records before sharing again.' };
    }
    const status = result.status || (result.redirected ? 'redirected' : result.queued ? 'queued' : result.blocked || result.failed ? 'failed' : result.skipped ? 'skipped' : result.id || result.sent ? 'sent' : 'unknown');
    const delivery = { status, reason: result.reason || null, communicationId: result.communicationId || null, messageId: result.id || null };
    await pool.execute('UPDATE client_exchange_shares SET status = ?, delivery_json = ? WHERE id = ?', [status, JSON.stringify(delivery), shareId]);
    // A manual share is a separate activity, never an automatic matching notification.
    try {
      const notification = await Notification.create({ type: 'client_exchange_shared', severity: 'info', title: context.subject,
        message: 'Your support team has shared a client for you to review. Open Client Exchange to see the fit details.',
        userId: providerUserId, agencyId: input.agencyId, relatedEntityType: 'client_exchange_listing', relatedEntityId: listingId,
        actorUserId: actor.id, actorSource: 'client_exchange', audienceJson: { agencySlug: context.agency?.slug || context.agency?.portal_url } });
      await pool.execute('UPDATE client_exchange_shares SET notification_id = ? WHERE id = ?', [notification.id, shareId]);
    } catch { /* The email receipt remains available even if the in-app notice needs retry. */ }
    return { share: { id: shareId, providerUserId, sharedByUserId: actor.id, shareNumber: context.previousShareCount + 1, status, delivery } };
  });
}
