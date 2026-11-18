import {readChartRecord,chartRecordContext as recordContext} from './clientChartRecordRead.service.js';
import pool from '../config/database.js';
import { encryptDemographicsPayload, decryptDemographicsPayload } from './demographicsImport.service.js';
import { readClientInsurance, writeClientInsurance } from './clientInsurance.service.js';
import { parseChartContacts, parseChartInsurance, parsePatientComments, parsePayerInformation, parseBillingComments } from './chartPasteParser.service.js';
import { upsertClientAffiliatedContact } from './clientContactAffiliation.service.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';
import Client from '../models/Client.model.js';
import { prepareGuardianAccount } from './guardianAccountPreparation.service.js';

export const chartSections = ['demographics', 'intake', 'plan', 'insurance', 'contacts', 'comments', 'payer', 'billingComments'];
export {readChartRecord} from './clientChartRecordRead.service.js';

export async function saveChartRecord(scope, section, owner, value, actorId, expectedRevision = null) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    // Serialize changes, including a first insert and contact imports, per chart.
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [scope.clientId, scope.agencyId]);
    const previous = await readChartRecord(scope, section, owner, db);
    if (expectedRevision != null && expectedRevision !== Number(previous.revision)) throw Object.assign(new Error('This draft changed in another window. Reopen the import panel before editing further.'), { status: 409 });
    const merged = ['contacts','payer','payerLinks'].includes(section) && owner === 0
      ? { ...previous.value, ...Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, { ...previous.value?.[key], ...entry }])) }
      : value;
    const revision = Number(previous.revision) + 1;
    const encrypted = JSON.stringify(encryptDemographicsPayload({ context: recordContext(scope, section, owner), value: merged }));
    await db.execute(`INSERT INTO client_chart_import_records (agency_id,client_id,section_key,owner_user_id,payload_enc,revision,updated_by_user_id)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE payload_enc=VALUES(payload_enc),revision=VALUES(revision),updated_by_user_id=VALUES(updated_by_user_id)`,
    [scope.agencyId, scope.clientId, section, owner, encrypted, revision, actorId]);
    await db.commit();
    return { value: merged, revision };
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}

export async function importSupplementaryChartSection(scope, section, text, actorId, { position = null, preparePrimaryGuardian = false, guardianContactNames = [] } = {}) {
  if (section === 'insurance') {
    const parsed = parseChartInsurance(text, { position });
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [scope.clientId, scope.agencyId]);
      const previous = await readClientInsurance(scope.clientId, scope.agencyId, db) || {};
      const changed = Object.fromEntries(['primary', 'secondary'].filter(slot => parsed[slot]).map(slot => [slot, { ...previous[slot], ...parsed[slot] }]));
      // Source system IDs are not trusted clearinghouse routes. Preserve an
      // existing link only when its source ID is unchanged; verify new routes.
      for (const slot of ['primary', 'secondary']) if (parsed[slot]?.payerId) {
        changed[slot].sourcePayerId = parsed[slot].payerId;
        changed[slot].payerId = previous[slot]?.sourcePayerId === parsed[slot].payerId || previous[slot]?.payerId === parsed[slot].payerId ? previous[slot]?.payerId || '' : '';
      }
      const insurance = await writeClientInsurance({ ...previous, ...changed, ...scope, confirmedBy: actorId, verifiedForClaims: false, queueEligibility: false }, db);
      await db.commit();
      return { primary: insurance.primary, secondary: insurance.secondary, needsBillingReview: true };
    } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  }
  if (section === 'comments') {
    const message = parsePatientComments(text);
    if (!message) throw Object.assign(new Error('Paste patient comments to import'), { status: 400 });
    return (await saveChartRecord(scope, section, 0, { message }, actorId)).value;
  }
  if (section === 'payer') return (await saveChartRecord(scope, section, 0, { [position || 'primary']: parsePayerInformation(text) }, actorId)).value;
  if (section === 'billingComments') {
    const message = parseBillingComments(text);
    if (!message) throw Object.assign(new Error('Paste billing comments to import'), { status: 400 });
    return (await saveChartRecord(scope, section, 0, { message }, actorId)).value;
  }
  if (section === 'contacts') {
    const contacts = parseChartContacts(text);
    const imported = {};
    const existing = await ClientContactAffiliation.listForClient(scope.clientId, { includeInactive: true });
    const nameKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const requestedAccounts = new Set(guardianContactNames.map(nameKey));
    let client = null, primaryContact = null;
    if (preparePrimaryGuardian || requestedAccounts.size) {
      client = await Client.findById(scope.clientId, { includeSensitive: true });
      if (!client || Number(client.agency_id) !== Number(scope.agencyId)) throw Object.assign(new Error('Client not found in this agency'), { status: 404 });
      let demographics = {};
      if (client.demographics_phi_enc) demographics = decryptDemographicsPayload(client.demographics_phi_enc) || {};
      const source = demographics.sourceContact || demographics;
      const emailKey = value => String(value || '').trim().toLowerCase();
      const phoneKey = value => String(value || '').replace(/\D/g, '').slice(-10);
      const email = emailKey(source.email || client.email), phone = phoneKey(source.contactPhone || client.contact_phone);
      const parents = contacts.filter(contact => /^(father|mother|parent|guardian|legal guardian|padre|madre|tutor)$/i.test(contact.relationshipType || '') || /^guardian$/i.test(contact.contactType || ''));
      const emailMatches = parents.filter(contact => email && emailKey(contact.email) === email);
      const phoneMatches = parents.filter(contact => phone && phoneKey(contact.mobilePhone || contact.phone || contact.homePhone || contact.workPhone) === phone);
      // Prefer the exact email over a household phone shared by two parents.
      // Ambiguous contact details stay pending for explicit staff selection.
      primaryContact = emailMatches.length === 1 ? emailMatches[0] : !emailMatches.length && phoneMatches.length === 1 ? phoneMatches[0] : null;
    }
    for (const contact of contacts) {
      const matches = existing.filter(row => nameKey(row.contact_full_name) === nameKey(contact.fullName));
      if (matches.length > 1) throw Object.assign(new Error('More than one existing contact has this name. Resolve the duplicate contacts before importing.'), { status: 409 });
      const result = await upsertClientAffiliatedContact({ ...scope, userId: actorId, fullName: contact.fullName, email: contact.email,
        phone: contact.mobilePhone || contact.phone || contact.homePhone || contact.workPhone,
        relationshipType: contact.relationshipType, existingContactId: matches[0]?.agency_contact_id || null, importOnly: true });
      const affiliation = result.affiliation;
      const id = Number(affiliation?.id);
      if (!id) throw new Error('Contact import did not return an affiliation');
      imported[id] = { ...contact, affiliationId: id };
      if ((preparePrimaryGuardian && contact === primaryContact) || requestedAccounts.has(nameKey(contact.fullName))) {
        const names = contact.fullName.split(/\s+/);
        const portalAccount = await prepareGuardianAccount({ client, profile: { ...contact, firstName: contact.firstName || names.shift(), lastName: contact.lastName || names.join(' '),
          phone: contact.mobilePhone || contact.phone || contact.homePhone || contact.workPhone, relationship: contact.relationshipType }, actorUserId: actorId });
        imported[id].portalAccount = portalAccount;
      }
      // Persist each contact so retries preserve completed work after a partial failure.
      await saveChartRecord(scope, section, 0, { [id]: imported[id] }, actorId);
      if (!matches.length) existing.push({ contact_full_name: contact.fullName, agency_contact_id: affiliation.agencyContactId || affiliation.contact?.id });
    }
    return Object.values(imported);
  }
  throw Object.assign(new Error('Use the clinical import for this section'), { status: 400 });
}
