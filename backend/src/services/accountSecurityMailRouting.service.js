import { createHash } from 'node:crypto';
import { simpleParser } from 'mailparser';
import pool from '../config/database.js';
import { groupKeyForIdentity } from './departmentalGroupPolicy.js';
import { managedDomain } from './managedWorkspaceGroupPolicy.js';
import { authenticatedFamilySender, extractFamilyEmailText } from './familyEmailPolicy.js';
import { extractEmails } from '../utils/gmailMessageParse.shared.js';

const GRASSHOPPER_SENDER = 'no-reply@grasshopper.com';
const SECURITY_SUBJECT = /\b(?:one[ -]time (?:password|passcode|code)|(?:reset|recover) (?:your )?password|password (?:reset|recovery)|(?:login|sign-in|verification|security|recovery) (?:verification )?code)\b/i;

function isAuthenticatedGroupCopy(headers, identity, sender) {
  const getFirst = name => headers.find(h => h.name?.toLowerCase() === name)?.value || '';
  const from = extractEmails(getFirst('from'));
  const auth = getFirst('authentication-results');
  if (from.length !== 1 || from[0] !== String(identity.from_email).toLowerCase() || !authenticatedFamilySender(headers, from[0])) return false;
  const domain = sender.split('@')[1];
  // The trusted receiving Gmail hop must report a passing ARC chain with
  // upstream DMARC for the original sender's domain.
  return auth.split(';').some(part => {
    const upstream = /^\s*arc=pass\s*\(([^)]*)\)/i.exec(part)?.[1] || '';
    return /\bdmarc=pass\b/i.test(upstream) && /\bdkim=pass\b/i.test(upstream)
      && upstream.match(/\bdkdomain=([a-z0-9.-]+)(?:\s|$)/i)?.[1].toLowerCase() === domain
      && upstream.match(/\bfromdomain=([a-z0-9.-]+)(?:\s|$)/i)?.[1].toLowerCase() === domain;
  });
}

export async function routeAccountSecurityMail(input, database = pool) {
  const { identity, matchedAddress, fromEmail, subject, payload, receivedAt, gmail } = input;
  const headers = payload?.headers || [];
  const getFirst = name => headers.find(h => h.name?.toLowerCase() === name)?.value || '';
  const messageId = getFirst('message-id').trim();
  if (/^<account-security\.[0-9a-f]{64}@[a-z0-9.-]+>$/i.test(messageId)) {
    const [[forward]] = await database.execute('SELECT 1 FROM account_security_mail_forwards WHERE forward_message_id=?', [messageId]);
    if (forward) return { handled: true };
  }

  const groupKey = groupKeyForIdentity(identity);
  const sender = String(fromEmail || '').toLowerCase();
  if (!receivedAt || !messageId || Number(identity?.is_active) !== 1 || !groupKey || groupKey === 'admin'
    || !SECURITY_SUBJECT.test(subject || '') || /^(?:re|fw|fwd)\s*:/i.test(subject)
    || getFirst('in-reply-to') || getFirst('references')) return { handled: false };

  const recipients = extractEmails(getFirst('to'));
  if (recipients.length !== 1 || recipients[0] !== matchedAddress || extractEmails(getFirst('cc')).length) return { handled: false };
  if (!authenticatedFamilySender(headers, sender) && !isAuthenticatedGroupCopy(headers, identity, sender)) return { handled: false };

  const [[tenant]] = await database.execute(`SELECT a.id,a.slug,a.organization_type,a.is_active,a.feature_flags,g.email AS admin_email
    FROM agencies a JOIN managed_workspace_groups g ON g.agency_id=a.id AND g.group_key='admin' AND g.last_synced_at IS NOT NULL
    JOIN account_security_mail_routing r ON r.id=1 AND r.starts_at<=?
    WHERE a.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`, [receivedAt, identity.agency_id]);
  if (!tenant) return { handled: false };
  const domain = managedDomain(tenant);
  const to = String(tenant.admin_email || '').toLowerCase();
  if (!domain || to !== `admin@${domain}` || !matchedAddress.endsWith(`@${domain}`)) return { handled: false };
  const flags = typeof tenant.feature_flags === 'string' ? JSON.parse(tenant.feature_flags) : tenant.feature_flags;
  const approvedSenders = Array.isArray(flags?.accountSecurityMailSenders) ? flags.accountSecurityMailSenders : [];
  if (sender !== GRASSHOPPER_SENDER && !approvedSenders.includes(sender)) return { handled: false };

  let body = await extractFamilyEmailText(payload);
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype html[^>]*>\s*)?<html(?:\s|>)/i.test(body)) {
    const parsed = await simpleParser(`Content-Type: text/html; charset=utf-8\r\n\r\n${body}`);
    body = parsed.text || '';
  }
  if (!body.trim()) return { handled: false };
  const sourceHash = createHash('sha256').update(messageId.toLowerCase()).digest('hex');
  const forwardingKey = createHash('sha256').update(`${tenant.id}:${sourceHash}`).digest('hex');
  const forwardId = `<account-security.${forwardingKey}@${domain}>`;
  const [claim] = await database.execute(`INSERT IGNORE INTO account_security_mail_forwards (agency_id, source_hash, forward_message_id)
    VALUES (?,?,?)`, [tenant.id, sourceHash, forwardId]);
  if (!claim.affectedRows) {
    const [[receipt]] = await database.execute('SELECT state FROM account_security_mail_forwards WHERE agency_id=? AND source_hash=?',
      [tenant.id, sourceHash]);
    return { handled: true, review: receipt?.state === 'review' };
  }

  try {
    const text = `Account security email for ${matchedAddress}\nFrom: ${sender}\n\n${body}`;
    const encodedSubject = Buffer.from(`Fwd: ${subject}`, 'utf8').toString('base64');
    const raw = Buffer.from([
      `To: ${to}`, `Subject: =?UTF-8?B?${encodedSubject}?=`, `Message-ID: ${forwardId}`,
      'Auto-Submitted: auto-generated', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64', '', Buffer.from(text, 'utf8').toString('base64').match(/.{1,76}/g).join('\r\n')
    ].join('\r\n')).toString('base64url');
    const sent = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    if (!sent.data?.id) throw new Error('Missing Gmail receipt');
    await database.execute("UPDATE account_security_mail_forwards SET state='sent' WHERE agency_id=? AND source_hash=?", [tenant.id, sourceHash]);
  } catch {
    // A failed connection can hide a successful Gmail send. Preserve the source
    // in Workspace and avoid repeating a delivery whose acceptance is uncertain.
    await database.execute("UPDATE account_security_mail_forwards SET state='review' WHERE agency_id=? AND source_hash=?", [tenant.id, sourceHash]);
    console.warn('[Account security email] Forwarding requires review');
    return { handled: true, review: true };
  }
  return { handled: true };
}
