import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import { hasTerminalClientStatus } from './clientTerminationRoster.service.js';

const fail = message => Object.assign(new Error(message), { status: 400 });
export function reviewedEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw fail('Enter one valid email address per recipient.');
  return email;
}
export function reviewedMessage(value, fallback) {
  if (!value) return fallback;
  const subject = String(value.subject || '').trim(), text = String(value.text || '').trim();
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject) || !text || text.length > 6000) throw fail('Review the email subject and message (up to 6,000 characters).');
  return { subject, text };
}

export function createCancellationRecipientService(overrides = {}) {
  const d = { database: pool, guardians: id => ClientGuardian.listForClient(id), consent: async (...args) => (await import('./sessionNotification.service.js')).loadClientConsent(...args),
    preferences: async (...args) => (await import('./sessionNotification.service.js')).getClientPreferences(...args),
    smsConsent: async (...args) => (await import('./smsCompliance.service.js')).recordedReminderConsent(...args),
    gate: async (...args) => (await import('./familyNotificationChoices.service.js')).familyNotificationDeliveryGate(...args),
    normalizePhone: PhoneNumber.normalizePhone, ...overrides };
  async function contacts(clientId, agencyId) {
    const [[client]] = await d.database.execute(`SELECT c.id,c.full_name,c.initials,c.email,c.contact_phone,c.status,s.status_key AS client_status_key,s.label AS client_status_label
      FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.id=? AND c.agency_id=?`, [clientId, agencyId]);
    if (!client || client.status === 'ARCHIVED' || hasTerminalClientStatus(client)) throw fail('Client is no longer available in this agency.');
    const links = (await d.guardians(clientId)).filter(g => Number(g.access_enabled) === 1 && !ClientGuardian.isNoView(g.permissions_json));
    const self = links.find(g => g.relationship_type === 'self');
    return { clientId, clientName: client.full_name || client.initials || 'Client', contacts: [
      { key: 'client', role: 'client', userId: self?.guardian_user_id || null, name: client.full_name || client.initials || 'Client', email: self?.email || client.email || '', phone: self?.phone || client.contact_phone || '' },
      ...links.filter(g => g.relationship_type !== 'self').map(g => ({ key: `guardian:${g.guardian_user_id}`, role: 'guardian', userId: Number(g.guardian_user_id), name: [g.first_name, g.last_name].filter(Boolean).join(' ') || 'Guardian', email: g.email || '', phone: g.phone || '' }))
    ] };
  }
  async function review(clientId, agencyId, input, { required = false } = {}) {
    const available = await contacts(clientId, agencyId);
    const mode = input?.mode || (available.contacts.some(c => c.role === 'guardian') ? 'guardian' : 'client');
    if (!['client', 'guardian', 'both', 'none'].includes(mode)) throw fail('Choose client, guardian, both, or no contact.');
    const channels = input?.channels || ['email'];
    if (!Array.isArray(channels) || channels.some(c => !['email', 'sms'].includes(c)) || (mode !== 'none' && !channels.length)) throw fail('Choose email and/or text.');
    const edits = input?.recipients || [];
    if (!Array.isArray(edits) || edits.some(e => !available.contacts.some(c => c.key === e.key))) throw fail('A selected contact is no longer linked to this client.');
    const recipients = available.contacts.filter(c => mode === 'both' || c.role === mode).map(c => {
      const edit = edits.find(e => e.key === c.key);
      const email = edit?.email ?? c.email, phone = edit?.phone ?? c.phone;
      return { ...c, email: email ? reviewedEmail(email) : '', phone: phone ? d.normalizePhone(phone) : '', enabled: edit?.enabled !== false };
    }).filter(c => c.enabled);
    if (required && mode !== 'none' && !recipients.length) throw fail('No authorized contacts match this choice. Select another contact option.');
    if (required && recipients.some(c => channels.includes('email') && !c.email || channels.includes('sms') && !c.phone)) throw fail('Add the missing email or phone, or turn off that channel for this client.');
    if (required && channels.includes('sms') && recipients.some(c => !/^\+[1-9]\d{7,14}$/.test(c.phone))) throw fail('Enter a valid phone number, including its country code, for each text recipient.');
    return { ...available, mode, channels: [...new Set(channels)], recipients };
  }
  async function permitted(clientId, agencyId, recipient, channel) {
    // Recheck access and opt-outs after review, immediately before transport.
    const current = await contacts(clientId, agencyId);
    if (!current.contacts.some(c => c.key === recipient.key && Number(c.userId) === Number(recipient.userId))) return false;
    const consent = await d.consent(clientId, agencyId, recipient.userId || null);
    if (!Object.hasOwn(consent, 'emailAddress') && !Object.hasOwn(consent, 'phoneNumber')) return false;
    const prefs = await d.preferences(agencyId, clientId, recipient.userId);
    if (prefs.schedulingChangesEnabled === false || prefs.providerPushedUpdatesEnabled === false || (!prefs.isDefault && prefs.channels?.[channel] === false)) return false;
    const address = channel === 'sms' ? recipient.phone : recipient.email;
    if (!address || !(await d.gate({ agencyId, clientId, to: address, channel, notificationCategory: 'schedule_changes' })).allowed) return false;
    if (channel === 'sms') {
      // An older consent record must not override a newer intake decline for this phone.
      if (d.normalizePhone(consent.phoneNumber) === d.normalizePhone(address) && consent.sms !== true) return false;
      return !!await d.smsConsent(agencyId, address);
    }
    return consent.email !== false;
  }
  return { contacts, review, permitted };
}
export const cancellationRecipients = createCancellationRecipientService();
