import crypto from 'node:crypto';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { readChartTypes, personalContactReviewReason } from './clientChartTypes.service.js';
import { clientPortalInviteUrl, resolveClientPortalContext } from './clientPortalContext.service.js';
import { preparePortalInvitationAccess } from './portalInvitationAccess.service.js';
import { preparePersonalPortal } from './personalPortalPreparation.service.js';
import { hasEstablishedPortalPassword } from '../utils/portalAccountCredentials.js';
import { guardianClientPrivacy } from './guardianClientPrivacy.service.js';
import { ageOn } from './guardianClinicalAccess.service.js';

const normalEmail = value => String(value || '').trim().toLowerCase();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const setupPath = '/api/public/appointment-response/portal-setup/';
const unavailable = () => Object.assign(new Error('This setup link is unavailable. Contact your care team for a new invitation.'), { status: 410 });

function usableRelationship(row, client) {
  const permissions = typeof row.permissions_json === 'string' ? JSON.parse(row.permissions_json) : row.permissions_json || {};
  return permissions && typeof permissions === 'object' && !Array.isArray(permissions) &&
    !(permissions.noView || permissions.noContact || permissions.relationshipRevoked ||
      permissions.pendingGuardianVerification || permissions.noViewOtherGuardian || permissions.coGuardianInviteRestricted) &&
    (row.relationship_type === 'self' || (ageOn(client.date_of_birth) ?? 18) < 18);
}

async function resolveRecipient(client, emailHash, db = pool) {
  if (!client || !client.date_of_birth || ['archived','inactive','terminated'].includes(String(client.status || '').toLowerCase())) return null;
  if (Number(client.guardian_portal_enabled)) {
    const [rows] = await db.execute(`SELECT u.id,u.email,u.password_hash,u.temporary_password_hash,g.relationship_type,g.permissions_json
      FROM client_guardians g JOIN users u ON u.id=g.guardian_user_id
      WHERE g.client_id=? AND g.access_enabled=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
        AND u.role IN ('client','client_guardian','guardian') AND UPPER(u.status) IN ('ACTIVE','PENDING','PENDING_SETUP')
        AND u.terminated_at IS NULL AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP())
        AND NOT EXISTS (SELECT 1 FROM dependent_portal_access d WHERE d.client_id=g.client_id AND d.user_id=u.id AND d.revoked_at IS NOT NULL)`, [client.id]);
    const matches = rows.filter(row => hash(normalEmail(row.email)) === emailHash);
    if (matches.length) {
      const account = matches[0];
      if (matches.length !== 1 || !usableRelationship(account, client)) return null;
      if (account.relationship_type !== 'self' && await guardianClientPrivacy({clientId:client.id,guardianUserId:account.id},db)) return null;
      return { account };
    }
  }
  if (!normalEmail(client.email) || hash(normalEmail(client.email)) !== emailHash || !(ageOn(client.date_of_birth) >= 18)) return null;
  const profile = await readChartTypes(client.id, client.agency_id, db, { checkContact: false });
  if (profile.portalSetup?.state !== 'confirm_ownership' || profile.types.includes('dependent') || await personalContactReviewReason(client.id, db)) return null;
  return { account: null };
}

export async function clinicalEmailPortalLink({ context, to }) {
  const client = context?.client;
  if (!context?.clinical || !client || !normalEmail(to)) return null;
  const emailHash = hash(normalEmail(to));
  const recipient = await resolveRecipient(client, emailHash);
  if (!recipient) return null;
  if (hasEstablishedPortalPassword(recipient.account)) {
    return { label: 'Sign in to AuricWell', url: clientPortalInviteUrl({ portal: context.portal, existingAccount: true }) };
  }
  const token = crypto.randomBytes(32).toString('hex');
  await pool.execute(`INSERT INTO clinical_portal_setup_email_links
    (token_hash,client_id,agency_id,account_id,recipient_hash,expires_at)
    VALUES (?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 72 HOUR))`,
  [hash(token), client.id, client.agency_id, recipient.account?.id ?? null, emailHash]);
  return { label: 'Set up your portal now', url: `https://auricwell.com${setupPath}${token}` };
}

async function loadLink(token, db = pool) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw unavailable();
  const [[row]] = await db.execute(`SELECT * FROM clinical_portal_setup_email_links
    WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() AND failed_attempts<5`, [hash(token)]);
  if (!row) throw unavailable();
  return row;
}

async function currentSetup(row, db) {
  const client = await Client.findById(row.client_id);
  if (!client || Number(client.agency_id) !== Number(row.agency_id)) throw unavailable();
  const context = await resolveClientPortalContext(client);
  const recipient = context.clinical ? await resolveRecipient(client, row.recipient_hash, db) : null;
  if (!recipient || (recipient.account?.id ?? null) !== row.account_id) throw unavailable();
  return { client, recipient, portal: context.portal };
}

export async function readClinicalPortalSetup(token) {
  const { recipient } = await currentSetup(await loadLink(token), pool);
  return { dependent: !!recipient.account && recipient.account.relationship_type !== 'self' };
}

export async function completeClinicalPortalSetup(token, birthDate) {
  const initial = await loadLink(token);
  const lockName = `clinical-portal-setup:${initial.client_id}`;
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,3) AS acquired', [lockName]);
    locked = Number(lock.acquired) === 1;
    if (!locked) throw unavailable();
    const row = await loadLink(token, db);
    const { client, recipient, portal } = await currentSetup(row, db);
    const [[attempts]] = await db.execute(`SELECT COALESCE(SUM(failed_attempts),0) AS failures FROM clinical_portal_setup_email_links
      WHERE client_id=? AND last_failed_at>DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)`, [row.client_id]);
    if (Number(attempts.failures) >= 5) throw unavailable();
    const expected = client.date_of_birth instanceof Date ? client.date_of_birth.toISOString().slice(0,10) : String(client.date_of_birth).slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate !== expected) {
      await db.execute('UPDATE clinical_portal_setup_email_links SET failed_attempts=failed_attempts+1,last_failed_at=UTC_TIMESTAMP() WHERE token_hash=?', [row.token_hash]);
      throw Object.assign(new Error('The birth date did not match. Check the date and try again.'), { status: 400 });
    }

    let account = recipient.account;
    if (!account) {
      const [firstName, ...rest] = String(client.full_name || '').trim().split(/\s+/);
      const lastName = rest.join(' ');
      if (!firstName || !lastName) throw unavailable();
      ({ account } = await preparePersonalPortal({
        client, email: normalEmail(client.email), firstName, lastName, actorUserId: null,
        permissions: { canViewDocs:true, canSignDocs:true, canViewLinks:true, canMessage:true }, enableAccess:true, verifiedBirthDate:birthDate
      }));
    }
    const access = await preparePortalInvitationAccess(account);
    if (!access.existingAccount && !access.tokenResult?.token) throw unavailable();
    await db.execute('UPDATE clinical_portal_setup_email_links SET used_at=UTC_TIMESTAMP() WHERE client_id=? AND recipient_hash=? AND used_at IS NULL',
      [row.client_id, row.recipient_hash]);
    return clientPortalInviteUrl({ portal, token: access.tokenResult?.token, existingAccount: access.existingAccount });
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
    finally { db.release(); }
  }
}
