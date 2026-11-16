import pool from '../config/database.js';
import { billingError, positiveId, requireBillingLink } from './familyBillingPolicy.service.js';
import { requireClient, transaction } from './familyLedger/policy.js';
import { serviceCode, serviceTotal } from './familyLedger/serviceRates.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { hasMedicaidCoverage } from '../utils/insurancePaymentPolicy.js';

const context = (agencyId, clientId) => `billing-responsibility:${agencyId}:${clientId}`;
export function normalizeResponsibleParty(input) {
  if (!['account', 'other'].includes(input?.kind)) throw billingError(400, 'Choose the client, a linked responsible payer, or someone else.');
  const contact = Object.fromEntries(['fullName', 'email', 'phone', 'address', 'city', 'state', 'postalCode'].map(key => [key, String(input.contact?.[key] || '').trim().slice(0, key === 'address' ? 500 : 255)]));
  if (input.kind === 'other' && Object.values(contact).some(value => !value)) throw billingError(400, 'Enter the responsible party’s name, email, phone and complete mailing address.');
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw billingError(400, 'Enter one valid billing email address.');
  return { kind: input.kind, userId: input.kind === 'account' ? positiveId(input.userId) : null, contact };
}

export async function clientBillingAccount(agencyId, clientId, db = pool) {
  await requireClient(agencyId, clientId, db);
  const [[party]] = await db.execute('SELECT * FROM client_billing_responsibility_profiles WHERE agency_id=? AND client_id=?', [agencyId, clientId]);
  const [accounts] = await db.execute(`SELECT u.id,u.first_name,u.last_name,u.email,COALESCE(u.phone_number,u.personal_phone,u.work_phone) AS phone,cg.relationship_type,cg.relationship_title,cg.access_enabled FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? AND u.role IN ('client','client_guardian') ORDER BY cg.relationship_type='self' DESC,cg.created_at,u.id`, [clientId]);
  const [rates] = await db.execute('SELECT service_code AS serviceCode,amount_cents AS amountCents,price_basis AS priceBasis,revision FROM client_patient_service_rates WHERE agency_id=? AND client_id=? ORDER BY service_code', [agencyId, clientId]);
  return { responsibleParty: party ? { kind: party.party_kind, userId: party.responsible_user_id, contact: decryptFamilyBilling(party.contact_encrypted, context(agencyId, clientId)), revision: party.revision } : null,
    needsResponsibleParty: !party, accounts: accounts.map(row => ({ id: row.id, name: [row.first_name, row.last_name].filter(Boolean).join(' '), email: row.email, phone: row.phone, relationship: row.relationship_type === 'self' ? 'Client (self)' : row.relationship_title || 'Guardian', accessEnabled: !!row.access_enabled })), rates };
}

export async function saveResponsibleParty({ agencyId, clientId, party, revision = 0, actorUserId }) {
  const normalized = normalizeResponsibleParty(party);
  return transaction(async db => {
    await requireClient(agencyId, clientId, db);
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [clientId, agencyId]);
    const [[previous]] = await db.execute('SELECT revision FROM client_billing_responsibility_profiles WHERE agency_id=? AND client_id=? FOR UPDATE', [agencyId, clientId]);
    if (Number(previous?.revision || 0) !== Number(revision)) throw billingError(409, 'The responsible billing party changed. Refresh before saving.');
    if (normalized.userId) {
      const [[account]] = await db.execute(`SELECT u.first_name,u.last_name,u.email,COALESCE(u.phone_number,u.personal_phone,u.work_phone) AS phone,CASE WHEN cg.relationship_type='self' THEN c.address_street ELSE u.home_street_address END AS address,CASE WHEN cg.relationship_type='self' THEN c.address_city ELSE u.home_city END AS city,CASE WHEN cg.relationship_type='self' THEN c.address_state ELSE u.home_state END AS state,CASE WHEN cg.relationship_type='self' THEN c.address_zip ELSE u.home_postal_code END AS postalCode FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id JOIN clients c ON c.id=cg.client_id WHERE cg.client_id=? AND cg.guardian_user_id=? AND u.role IN ('client','client_guardian')`, [clientId, normalized.userId]);
      if (!account) throw billingError(400, 'Choose an account linked to this client.');
      normalized.contact = { ...normalized.contact, fullName: [account.first_name, account.last_name].filter(Boolean).join(' '), email: account.email || '', phone: account.phone || '' };
      for(const key of ['address','city','state','postalCode'])if(!normalized.contact[key]&&account[key])normalized.contact[key]=account[key];
    }
    await db.execute('INSERT INTO client_billing_responsibility_profiles (agency_id,client_id,party_kind,responsible_user_id,contact_encrypted,revision,updated_by_user_id) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE party_kind=VALUES(party_kind),responsible_user_id=VALUES(responsible_user_id),contact_encrypted=VALUES(contact_encrypted),revision=VALUES(revision),updated_by_user_id=VALUES(updated_by_user_id)', [agencyId, clientId, normalized.kind, normalized.userId, encryptFamilyBilling(normalized.contact, context(agencyId, clientId)), Number(revision) + 1, actorUserId]);
    await db.execute('INSERT INTO client_billing_account_events (agency_id,client_id,actor_user_id,action,evidence_encrypted) VALUES (?,?,?,?,?)', [agencyId, clientId, actorUserId, 'responsible_party_selected', encryptFamilyBilling(normalized, context(agencyId, clientId))]);
    return { saved: true, revision: Number(revision) + 1 };
  });
}

export async function saveClientServiceRate({ agencyId, clientId, code, amountCents, priceBasis, revision = 0, reason, actorUserId }) {
  code = serviceCode(code);
  serviceTotal(amountCents, priceBasis, 1);
  if (!String(reason || '').trim()) throw billingError(400, 'Record the agreed client self-pay terms.');
  return transaction(async db => {
    await requireClient(agencyId, clientId, db);
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [clientId, agencyId]);
    const insurance = await readClientInsurance(clientId, agencyId, db);
    if (hasMedicaidCoverage(insurance)) throw billingError(409, 'Medicaid-covered care cannot have a client self-pay override.');
    const [[previous]] = await db.execute('SELECT revision FROM client_patient_service_rates WHERE agency_id=? AND client_id=? AND service_code=? FOR UPDATE', [agencyId, clientId, code]);
    if (Number(previous?.revision || 0) !== Number(revision)) throw billingError(409, 'This client rate changed. Refresh before saving.');
    await db.execute('INSERT INTO client_patient_service_rates (agency_id,client_id,service_code,amount_cents,price_basis,revision,updated_by_user_id) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE amount_cents=VALUES(amount_cents),price_basis=VALUES(price_basis),revision=VALUES(revision),updated_by_user_id=VALUES(updated_by_user_id)', [agencyId, clientId, code, amountCents, priceBasis, Number(revision) + 1, actorUserId]);
    if(!insurance?.primary?.insurerName&&!insurance?.secondary?.insurerName)await db.execute("INSERT INTO client_billing_readiness (agency_id,client_id,coverage_mode,setup_status,collection_policy,evidence_encrypted,updated_by_user_id) VALUES (?,?,'self_pay','incomplete','manual',?,?) ON DUPLICATE KEY UPDATE coverage_mode='self_pay',setup_status='incomplete',automatic_from=NULL,evidence_encrypted=VALUES(evidence_encrypted),updated_by_user_id=VALUES(updated_by_user_id)",[agencyId,clientId,encryptFamilyBilling({reason:'Explicit client self-pay service override recorded; review signed terms and payer responsibility before collection.'},`billing-readiness:${agencyId}:${clientId}`),actorUserId]);
    await db.execute('INSERT INTO client_billing_account_events (agency_id,client_id,actor_user_id,action,evidence_encrypted) VALUES (?,?,?,?,?)', [agencyId, clientId, actorUserId, 'client_self_pay_rate_saved', encryptFamilyBilling({ code, amountCents, priceBasis, revision: Number(revision) + 1, reason: String(reason).trim().slice(0, 2000) }, context(agencyId, clientId))]);
    return { serviceCode: code, amountCents, priceBasis, revision: Number(revision) + 1 };
  });
}

export async function guardianResponsibleParty({ userId, agencyId, clientId, party, revision }) {
  await requireBillingLink(userId, clientId, agencyId);
  if (party?.kind === 'account' && Number(party.userId) !== Number(userId)) throw billingError(403, 'Select your own account or provide the other responsible party’s contact information.');
  return saveResponsibleParty({ agencyId, clientId, party, revision, actorUserId: userId });
}
