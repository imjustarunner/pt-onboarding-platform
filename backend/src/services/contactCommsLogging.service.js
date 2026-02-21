/**
 * Log platform communications to contact_communication_logs when the recipient
 * maps to an agency_contact. Used for email and (future) push when sending to contacts.
 */
import AgencyContact from '../models/AgencyContact.model.js';
import ContactCommunicationLog from '../models/ContactCommunicationLog.model.js';

/**
 * If the recipient (email or phone) maps to an agency contact, log the communication.
 * @param {Object} opts
 * @param {number} opts.agencyId
 * @param {string} opts.channel - 'email' | 'sms' | 'push'
 * @param {string} opts.direction - 'inbound' | 'outbound'
 * @param {string} opts.recipient - email address or phone number
 * @param {string} opts.body
 * @param {string|null} opts.externalRefId
 * @param {Object|null} opts.metadata
 */
export async function logContactCommunicationIfApplicable(opts) {
  const { agencyId, channel, direction, recipient, body, externalRefId = null, metadata = null } = opts || {};
  if (!agencyId || !recipient) return;

  try {
    let contact = null;
    if (channel === 'email' && recipient && String(recipient).includes('@')) {
      contact = await AgencyContact.findByEmail(recipient, agencyId);
    } else if ((channel === 'sms' || channel === 'push') && recipient) {
      contact = await AgencyContact.findByPhone(recipient, agencyId);
    }
    if (!contact) return;

    await ContactCommunicationLog.create({
      contactId: contact.id,
      channel,
      direction,
      body: body || '',
      externalRefId,
      metadata: metadata || {}
    });
  } catch (e) {
    console.warn('Contact comm log (email/push) failed:', e.message);
  }
}
