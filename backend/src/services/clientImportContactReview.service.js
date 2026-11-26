import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import Contact from '../models/ClientContactAffiliation.model.js';
import Guardian from '../models/ClientGuardian.model.js';
import IntakeProfile from '../models/ClientGuardianIntakeProfile.model.js';
import { parseChartContacts } from './chartPasteParser.service.js';
import { portalContactRelationships } from '../../../frontend/src/navigation/recordsContactOwnership.js';

const fields = ['fullName', 'relationshipType', 'email', 'phone'];
const portalRoles = new Set(['client_guardian', 'guardian', 'client']);
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
const nameKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const emailKey = value => String(value || '').trim().toLowerCase();
const phoneKey = value => String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const text = value => String(value || '').trim();
const valuesFrom = contact => ({
  fullName: text(contact.fullName),
  relationshipType: text(contact.relationshipType),
  email: emailKey(contact.email),
  phone: text(contact.mobilePhone || contact.phone || contact.homePhone || contact.workPhone)
});
const nameOf = row => text(row.fullName || [row.first_name, row.last_name].filter(Boolean).join(' '));
const error = (message, code = 'CONTACT_IMPORT_REVIEW_REQUIRED') => Object.assign(new Error(message), { status: 409, code });
const samePerson = (candidate, incoming) => {
  const name = nameKey(nameOf(candidate));
  return !!name && name === nameKey(incoming.fullName);
};
const sameEmail = (candidate, incoming) => !!incoming.email && emailKey(candidate.email) === incoming.email;

async function emailAccounts(emails) {
  if (!emails.length) return [];
  const marks = emails.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id,email,first_name,last_name,role FROM users WHERE email IN (${marks})
    UNION SELECT id,personal_email,first_name,last_name,role FROM users WHERE personal_email IN (${marks})
    UNION SELECT id,work_email,first_name,last_name,role FROM users WHERE work_email IN (${marks})
    UNION SELECT u.id,e.email,u.first_name,u.last_name,u.role FROM user_login_emails e JOIN users u ON u.id=e.user_id WHERE e.email IN (${marks})`,
    [...emails, ...emails, ...emails, ...emails]
  );
  return rows;
}

export async function previewChartContactImport(scope, source, { accountAccess = false } = {}, deps = {}) {
  const contacts = source.trim() ? parseChartContacts(source) : [];
  const [saved, linked, profile] = await Promise.all([
    (deps.contacts || Contact.listForClient)(scope.clientId, { includeInactive: true }),
    accountAccess ? (deps.guardians || Guardian.listForClient.bind(Guardian))(scope.clientId) : [],
    accountAccess ? (deps.intakeProfile || IntakeProfile.findByClientId.bind(IntakeProfile))(scope.clientId) : null
  ]);
  const existing = saved.filter(row => Number(row.agency_id) === Number(scope.agencyId)).map(row => ({
    id: Number(row.id), contactId: Number(row.agency_contact_id),
    active: Number(row.is_active) === 1 && Number(row.contact_is_active) === 1,
    ...valuesFrom({ fullName: row.contact_full_name, email: row.contact_email, phone: row.contact_phone, relationshipType: row.relationship_type })
  }));
  const guardians = linked.filter(row => row.relationship_type !== 'self');
  const emails = [...new Set(contacts.map(contact => emailKey(contact.email)).filter(validEmail))];
  const accounts = accountAccess ? await (deps.accounts || emailAccounts)(emails) : [];
  const duplicateNames = new Set();
  const seenNames = new Set();
  for (const contact of contacts) {
    const name = nameKey(contact.fullName);
    if (seenNames.has(name)) duplicateNames.add(name);
    seenNames.add(name);
  }
  const rows = contacts.map((contact, index) => {
    const incoming = valuesFrom(contact);
    const matches = existing.filter(candidate => samePerson(candidate, incoming));
    const current = matches.length === 1 ? matches[0] : null;
    const duplicateEmail = existing.some(candidate => sameEmail(candidate, incoming) && !samePerson(candidate, incoming));
    const namedGuardians = guardians.filter(candidate => samePerson(candidate, incoming));
    const otherEmail = guardians.some(candidate => sameEmail(candidate, incoming) && !samePerson(candidate, incoming));
    const login = namedGuardians.length === 1 ? namedGuardians[0] : null;
    const matchedAccounts = accounts.filter(candidate => sameEmail(candidate, incoming));
    const account = matchedAccounts[0];
    const profileExists = Boolean(profile && samePerson(profile, incoming));
    const accountNeedsReview = namedGuardians.length > 1 || matchedAccounts.length > 1 || otherEmail
      || !!(account && (!portalRoles.has(String(account.role).toLowerCase()) || !samePerson(account, incoming)));
    const accountStatus = accountNeedsReview ? 'review' : login ? 'linked' : account ? 'existing' : 'none';
    const blocked = matches.length > 1 || duplicateNames.has(nameKey(incoming.fullName)) || duplicateEmail;
    const detailsDiffer = Boolean(login && (
      incoming.email && emailKey(login.email) !== incoming.email
      || incoming.phone && phoneKey(login.phone) !== phoneKey(incoming.phone)
    ));
    const isGuardian = profileExists || !!login || portalContactRelationships.some(relation => relation.toLowerCase() === incoming.relationshipType.toLowerCase())
      || /^guardian$/i.test(contact.contactType || '');
    return {
      index, incoming, current, isGuardian, profileExists, accountStatus, detailsDiffer, blocked,
      missing: ['email', 'phone'].filter(field => !incoming[field] && !current?.[field]),
      defaults: Object.fromEntries(fields.map(field => [field, incoming[field] || !current ? 'incoming' : 'current']))
    };
  });
  const existingGuardians = guardians.map(row => ({
    id: Number(row.guardian_user_id), name: nameOf(row), relationship: row.relationship_title,
    accessEnabled: Number(row.access_enabled) === 1,
    contactOnFile: existing.some(contact => nameKey(contact.fullName) === nameKey(nameOf(row)) || contact.email && contact.email === emailKey(row.email))
  }));
  const token = createHash('sha256').update(JSON.stringify([scope.agencyId, scope.clientId, source, rows])).digest('base64url');
  return {
    rows, token, existingGuardians, existingContacts: existing, hasIntakeProfile: !!profile,
    needsReview: rows.some(row => row.current || row.blocked || row.profileExists || row.accountStatus !== 'none')
  };
}

export function resolveChartContactReview(preview, approval) {
  if (preview.rows.some(row => row.blocked)) {
    throw error('One or more contacts share a name or email with another record. Review the saved contact cards or import these contacts separately.', 'CONTACT_IMPORT_IDENTITY_REVIEW');
  }
  if (!approval && !preview.needsReview) return preview.rows.map(row => ({ ...row, resolved: row.incoming }));
  if (approval?.token !== preview.token) {
    throw error('Review the side-by-side contact details before importing. If the chart changed, refresh the comparison.');
  }
  const choices = approval.choices || {};
  return preview.rows.map(row => {
    const selected = choices[row.index] || {};
    const resolved = Object.fromEntries(fields.map(field => {
      const side = selected[field] ?? row.defaults[field];
      if (!['incoming', 'current'].includes(side) || side === 'current' && !row.current) {
        throw error('Choose an available source for each contact field.');
      }
      return [field, side === 'current' || !row.incoming[field] && row.current ? row.current[field] : row.incoming[field]];
    }));
    return { ...row, resolved };
  });
}
