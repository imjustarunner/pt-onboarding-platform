import pool from '../config/database.js';
import { encryptDemographicsPayload, decryptDemographicsPayload } from './demographicsImport.service.js';
import { readClientInsurance, writeClientInsurance } from './clientInsurance.service.js';
import { parseChartContacts, parseChartInsurance, parsePatientComments, parsePayerInformation, parseBillingComments } from './chartPasteParser.service.js';
import { upsertClientAffiliatedContact } from './clientContactAffiliation.service.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';

export const chartSections = ['demographics', 'intake', 'plan', 'insurance', 'contacts', 'comments', 'payer', 'billingComments'];
const recordContext = ({ agencyId, clientId }, section, owner) => `${agencyId}:${clientId}:${section}:${owner}`;

export async function readChartRecord(scope, section, owner = 0, db = pool) {
  const [rows] = await db.execute('SELECT payload_enc,revision FROM client_chart_import_records WHERE agency_id=? AND client_id=? AND section_key=? AND owner_user_id=?', [scope.agencyId, scope.clientId, section, owner]);
  if (!rows[0]) return { value: null, revision: 0 };
  const envelope = decryptDemographicsPayload(rows[0].payload_enc);
  if (envelope.context !== recordContext(scope, section, owner)) throw new Error('Chart record context mismatch');
  return { value: envelope.value, revision: rows[0].revision };
}

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

export async function importSupplementaryChartSection(scope, section, text, actorId, { position = 'primary' } = {}) {
  if (section === 'insurance') {
    const parsed = parseChartInsurance(text);
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
  if (section === 'payer') return (await saveChartRecord(scope, section, 0, { [position]: parsePayerInformation(text) }, actorId)).value;
  if (section === 'billingComments') {
    const message = parseBillingComments(text);
    if (!message) throw Object.assign(new Error('Paste billing comments to import'), { status: 400 });
    return (await saveChartRecord(scope, section, 0, { message }, actorId)).value;
  }
  if (section === 'contacts') {
    const contacts = parseChartContacts(text);
    const imported = {};
    const existing = await ClientContactAffiliation.listForClient(scope.clientId, { includeInactive: true });
    for (const contact of contacts) {
      const nameKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const matches = existing.filter(row => nameKey(row.contact_full_name) === nameKey(contact.fullName));
      if (matches.length > 1) throw Object.assign(new Error('More than one existing contact has this name. Resolve the duplicate contacts before importing.'), { status: 409 });
      const result = await upsertClientAffiliatedContact({ ...scope, userId: actorId, fullName: contact.fullName, email: contact.email,
        phone: contact.mobilePhone || contact.phone || contact.homePhone || contact.workPhone,
        relationshipType: contact.relationshipType, existingContactId: matches[0]?.agency_contact_id || null, importOnly: true });
      const affiliation = result.affiliation;
      const id = Number(affiliation?.id);
      if (!id) throw new Error('Contact import did not return an affiliation');
      imported[id] = { ...contact, affiliationId: id };
      // Persist each contact so retries preserve completed work after a partial failure.
      await saveChartRecord(scope, section, 0, { [id]: imported[id] }, actorId);
      if (!matches.length) existing.push({ contact_full_name: contact.fullName, agency_contact_id: affiliation.agencyContactId || affiliation.contact?.id });
    }
    return Object.values(imported);
  }
  throw Object.assign(new Error('Use the clinical import for this section'), { status: 400 });
}
