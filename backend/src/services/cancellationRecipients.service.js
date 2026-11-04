import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import { hasTerminalClientStatus } from './clientTerminationRoster.service.js';
import { schoolCancellationCaregiverContacts } from './schoolCancellationCaregiverContacts.service.js';
import { reviewedDayCancellationContext, validatedDayCancellationContext } from './dayCancellationEmail.service.js';

const fail = message => Object.assign(new Error(message), { status: 400 });
function notificationRelationshipDenied(link) {
  const permissions=ClientGuardian.parsePermissions(link.permissions_json) || {};
  return permissions.revoked===true || permissions.relationshipRevoked===true || permissions.noContact===true
    || permissions.no_contact===true || permissions.contactRestricted===true || permissions.canReceiveNotifications===false
    || !!link.revoked_at || ['revoked','removed','no_contact'].includes(String(link.relationship_status || '').toLowerCase());
}
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
    operational: reviewedDayCancellationContext,
    normalizePhone: PhoneNumber.normalizePhone, ...overrides };
  async function contacts(clientId, agencyId) {
    const [[client]] = await d.database.execute(`SELECT c.id,c.full_name,c.initials,c.email,c.contact_phone,c.date_of_birth,c.status,s.status_key AS client_status_key,s.label AS client_status_label,
      EXISTS(SELECT 1 FROM agencies school WHERE school.id=c.organization_id AND school.organization_type='school') AS is_school_client
      FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.id=? AND c.agency_id=?`, [clientId, agencyId]);
    if (!client || client.status === 'ARCHIVED' || hasTerminalClientStatus(client)) throw fail('Client is no longer available in this agency.');
    const allLinks = await d.guardians(clientId);
    const links = allLinks.filter(g => Number(g.access_enabled) === 1 && !ClientGuardian.isNoView(g.permissions_json) && !notificationRelationshipDenied(g));
    const guardianLinks=allLinks.filter(g=>g.relationship_type!=='self' && !notificationRelationshipDenied(g));
    const restrictedGuardianEmail = allLinks.some(g => g.relationship_type !== 'self' && String(g.email || '').trim()
      && notificationRelationshipDenied(g));
    const self = links.find(g => g.relationship_type === 'self');
    const caregiverContacts = await (d.caregivers || schoolCancellationCaregiverContacts)({client,agencyId,links:allLinks});
    const initials = String(client.initials || '').trim();
    const clientInitials = initials && initials.length <= 12 ? initials : String(client.full_name || '').trim().split(/\s+/).filter(Boolean).map(part => part[0]).join('').toUpperCase() || 'Unknown initials';
    return { clientId, clientName: client.full_name || client.initials || 'Client', clientInitials, contactAvailability:{restrictedGuardianEmail}, contacts: [
      { key: 'client', role: 'client', userId: self?.guardian_user_id || null, name: client.full_name || client.initials || 'Client', email: self?.email || client.email || '', phone: self?.phone || client.contact_phone || '' },
      ...guardianLinks.map(g => ({ key: `guardian:${g.guardian_user_id}`, role: 'guardian', userId: Number(g.guardian_user_id), name: [g.first_name, g.last_name].filter(Boolean).join(' ') || 'Guardian', email: g.email || '', phone: g.phone || '',
        ...((Number(g.access_enabled)!==1 || ClientGuardian.isNoView(g.permissions_json) || Number(g.is_active)===0
          || ['inactive','archived','terminated','disabled','pending_setup'].includes(String(g.status || '').toLowerCase()))
          ? {operationalOnly:true,source:'affiliated_guardian'} : {}) })),
      ...caregiverContacts.filter(contact=>!guardianLinks.some(link=>String(link.email || '').trim().toLowerCase()===contact.email))
    ] };
  }
  async function review(clientId, agencyId, input, { required = false, allowMissingEmail = false } = {}) {
    const available = await contacts(clientId, agencyId);
    const invalid = message => fail(`${available.clientName}: ${message}`);
    const mode = input?.mode || (available.contacts.some(c => c.role === 'guardian') ? 'guardian' : 'client');
    if (!['client', 'guardian', 'both', 'none'].includes(mode)) throw invalid('Choose client, guardian, both, or no contact.');
    const channels = input?.channels || ['email'];
    if (!Array.isArray(channels) || channels.some(c => !['email', 'sms'].includes(c)) || (mode !== 'none' && !channels.length)) throw invalid('Choose email and/or text.');
    const edits = input?.recipients || [];
    if (!Array.isArray(edits) || edits.some(e => !available.contacts.some(c => c.key === e.key))) throw invalid('A selected contact is no longer linked to this client.');
    const recipients = available.contacts.filter(c => mode === 'both' || c.role === mode).map(c => {
      const edit = edits.find(e => e.key === c.key);
      if (edit?.enabled === false) return {...c,enabled:false};
      const email = String(edit?.email ?? c.email ?? '').trim(), phone = edit?.phone ?? c.phone;
      if (c.operationalOnly && email.toLowerCase()!==String(c.email || '').trim().toLowerCase()) throw invalid('This address comes from a saved guardian or enrollment record. Update the authorized contact record before using a different email.');
      try { return { ...c, email: email ? reviewedEmail(email) : '', phone: phone ? d.normalizePhone(phone) : '', enabled: edit?.enabled !== false }; }
      catch (error) { throw invalid(`${c.name}: ${error.message}`); }
    }).filter(c => c.enabled);
    if (required && mode !== 'none' && !recipients.length && !allowMissingEmail) throw invalid('No authorized contacts match this choice. Select another contact option.');
    if (required && recipients.some(c => channels.includes('email') && !c.email && !allowMissingEmail || channels.includes('sms') && !c.phone)) throw invalid('Add the missing email or phone, or turn off that channel for this client.');
    if (required && channels.includes('sms') && recipients.some(c => !/^\+[1-9]\d{7,14}$/.test(c.phone))) throw invalid('Enter a valid phone number, including its country code, for each text recipient.');
    const contactIssue = mode === 'none' ? 'No family contact selected.'
      : recipients.some(recipient=>recipient.email) ? ''
        : available.contactAvailability.restrictedGuardianEmail ? 'A guardian email is saved, but contact or notification restrictions currently prevent delivery. Verify the relationship and contact permissions.'
          : mode === 'guardian' && !recipients.length ? 'No authorized guardian email contact is linked or selected.'
            : 'No email is available on the selected authorized contacts.';
    return { ...available, mode, channels: [...new Set(channels)], recipients,contactIssue };
  }
  async function permitted(clientId, agencyId, recipient, channel, review = null) {
    // Recheck access and opt-outs after review, immediately before transport.
    const current = await contacts(clientId, agencyId);
    const currentContact=current.contacts.find(c => c.key === recipient.key && Number(c.userId) === Number(recipient.userId));
    if (!currentContact) return false;
    const trustedContext=validatedDayCancellationContext(review?.validatedContext,{agencyId,clientId,to:recipient.email});
    const operational=channel==='email' && review?.reviewedCancellationToken
      ? trustedContext
        || await d.operational({agencyId,clientId,to:recipient.email,templateType:'day_cancellation',...review,generatedByUserId:review.actorUserId},{database:d.database}) : null;
    const sourceContact=operational?.item?.clients?.find(client=>Number(client.clientId)===Number(clientId))?.contacts
      ?.find(contact=>contact.key===recipient.key && Number(contact.userId)===Number(recipient.userId));
    if((trustedContext && !sourceContact) || (sourceContact && String(sourceContact.email || '').trim().toLowerCase()!==String(currentContact.email || '').trim().toLowerCase()))return false;
    if(currentContact.operationalOnly && !operational)return false;
    if(currentContact.operationalOnly && (String(currentContact.email || '').trim().toLowerCase()!==String(recipient.email || '').trim().toLowerCase()
        || (currentContact.source!=='affiliated_guardian' && Number(currentContact.intakeSubmissionId)!==Number(recipient.intakeSubmissionId))))return false;
    const consent = await d.consent(clientId, agencyId, operational && currentContact.operationalOnly ? null : recipient.userId || null);
    if (!Object.hasOwn(consent, 'emailAddress') && !Object.hasOwn(consent, 'phoneNumber')) return false;
    const prefs = await d.preferences(agencyId, clientId, recipient.userId);
    if (prefs.schedulingChangesEnabled === false || prefs.providerPushedUpdatesEnabled === false || (!operational && !prefs.isDefault && prefs.channels?.[channel] === false)) return false;
    const address = channel === 'sms' ? recipient.phone : recipient.email;
    if (!address || !(await d.gate({ agencyId, clientId, to: address, channel, notificationCategory: 'schedule_changes' })).allowed) return false;
    if (channel === 'sms') {
      // An older consent record must not override a newer intake decline for this phone.
      if (d.normalizePhone(consent.phoneNumber) === d.normalizePhone(address) && consent.sms !== true) return false;
      return !!await d.smsConsent(agencyId, address, {clientId,recipientUserId:recipient.userId || undefined});
    }
    return operational ? Object.hasOwn(consent,'emailAddress') : consent.email !== false;
  }
  async function operationalEmailPermitted(clientId,agencyId,recipient,snapshotContacts) {
    const current=(await contacts(clientId,agencyId)).contacts.find(contact=>contact.key===recipient.key && Number(contact.userId)===Number(recipient.userId));
    const original=snapshotContacts?.find(contact=>contact.key===recipient.key && Number(contact.userId)===Number(recipient.userId));
    const normalized=value=>String(value || '').trim().toLowerCase();
    if(!current || !original || normalized(current.email)!==normalized(original.email) || !recipient.email)return false;
    if(current.operationalOnly && (normalized(current.email)!==normalized(recipient.email)
      || (current.source!=='affiliated_guardian' && Number(current.intakeSubmissionId)!==Number(recipient.intakeSubmissionId))))return false;
    const prefs=await d.preferences(agencyId,clientId,recipient.userId);
    if(prefs.schedulingChangesEnabled===false || prefs.providerPushedUpdatesEnabled===false)return false;
    return (await d.gate({agencyId,clientId,to:recipient.email,channel:'email',notificationCategory:'schedule_changes'})).allowed;
  }
  return { contacts, review, permitted, operationalEmailPermitted };
}
export const cancellationRecipients = createCancellationRecipientService();
