import { createHash, randomBytes } from 'node:crypto';
import pool from '../config/database.js';
import { readEmploymentNoticeCampaign } from './employmentNoticeCampaign.service.js';
import { listSendAsAliases } from './gmailSendAs.service.js';
import { getGmailClient } from './unifiedEmail/gmailClient.js';

const allowedPersonalEmail = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const mimeText = content => Buffer.from(content).toString('base64').match(/.{1,76}/g).join('\r\n');

function buildMessage({ from, to, contact, subject, link, messageId }) {
  const boundary = 'employment-notice-' + randomBytes(12).toString('hex');
  const text = [
    'An important employment notice is available from ITSCO leadership.',
    'Open the private link to read the letter and acknowledge receipt. You can use the link without signing in to your work email.',
    link,
    'The acknowledgment only confirms receipt.',
    `For employment questions, contact ${contact}.`
  ].join('\n\n');
  const html = `<p>An important employment notice is available from ITSCO leadership.</p>
<p><a href="${escapeHtml(link)}">Read the notice and acknowledge receipt</a></p>
<p>You can use the link without signing in to your work email. The acknowledgment only confirms receipt.</p>
<p>For employment questions, contact <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>.</p>`;
  const raw = [
    `From: ITSCO Leadership <${from}>`, `To: <${to}>`, `Reply-To: <${contact}>`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: ${messageId}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', mimeText(text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', mimeText(html),
    `--${boundary}--`, ''
  ].join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

export async function deliverEmploymentNoticeMail({
  version, automationIdentity, db = pool, listAliases = listSendAsAliases, getClient = getGmailClient,
  readCampaign = readEmploymentNoticeCampaign
}) {
  const [rows] = await db.execute(
    `SELECT m.delivery_id, m.attempted_at, r.notice_id, r.user_id, n.subject, n.contact_email,
            LOWER(TRIM(u.personal_email)) AS personal_email,
            LOWER(HEX(m.personal_email_digest)) AS address_digest
       FROM employment_notice_mail m
       JOIN employment_notice_recipients r ON r.notice_id=m.notice_id AND r.user_id=m.user_id
       JOIN employment_notices n ON n.id=r.notice_id
       JOIN users u ON u.id=r.user_id
      WHERE n.version=? AND m.accepted_at IS NULL
        AND n.publish_at <= UTC_TIMESTAMP(3) AND UTC_TIMESTAMP(3)<n.link_until
      ORDER BY m.delivery_id LIMIT 5`,
    [version]
  );
  if (!rows.length) return { due: 0, accepted: 0, held: 0 };
  if (rows.length > 4) throw new Error('Campaign has more than four recipients');
  const from = 'notifications@itsco.health';
  const aliases = await listAliases();
  if (!aliases.some(alias => alias.sendAsEmail?.toLowerCase() === from && alias.verificationStatus === 'accepted')) {
    throw new Error('ITSCO system sender is unavailable');
  }
  const client = await getClient();
  let accepted = 0;
  let held = 0;
  let campaign;
  const matchesQueue = (address, row) => allowedPersonalEmail.test(address)
    && createHash('sha256').update(address).digest('hex') === row.address_digest;
  for (const row of rows) {
    let destination = row.personal_email || '';
    if (!matchesQueue(destination, row)) {
      campaign ??= await readCampaign();
      const target = campaign.version === version && campaign.targets.find(item => Number(item.userId) === Number(row.user_id));
      destination = String(target?.noticeEmail || '').trim().toLowerCase();
    }
    if (!matchesQueue(destination, row) || row.contact_email.toLowerCase() !== 'founders@itsco.health') {
      held++;
      await db.execute(
        `INSERT IGNORE INTO employment_notice_automation_audit
           (notice_id,user_id,operation,automation_identity,result)
           VALUES (?,?,'personal_mail_held',?,JSON_OBJECT('reason','recipient_or_sender_changed'))`,
        [row.notice_id, row.user_id, automationIdentity]
      );
      continue;
    }
    const messageId = `employment-notice-${row.delivery_id}@itsco.health`;
    try {
      let receipt;
      if (row.attempted_at) {
        const { data } = await client.users.messages.list({
          userId: 'me', q: `in:sent rfc822msgid:${messageId}`, maxResults: 2
        });
        if (data.messages?.length === 1) receipt = data.messages[0].id;
      } else {
        const key = randomBytes(32).toString('base64url');
        const [issued] = await db.execute(
          `INSERT INTO employment_notice_keys (digest,notice_id,user_id,channel,expires_at)
           SELECT ?,n.id,?,'personal_email',n.link_until FROM employment_notices n
           WHERE n.id=? AND UTC_TIMESTAMP(3)<n.link_until`,
          [createHash('sha256').update(key).digest(), row.user_id, row.notice_id]
        );
        if (!issued.affectedRows) { held++; continue; }
        const [claimed] = await db.execute(
          'UPDATE employment_notice_mail SET attempted_at=UTC_TIMESTAMP(3) WHERE delivery_id=? AND attempted_at IS NULL AND accepted_at IS NULL',
          [row.delivery_id]
        );
        if (!claimed.affectedRows) { held++; continue; }
        const link = `https://app.itsco.health/employment-notice#${key}`;
        const { data } = await client.users.messages.send({
          userId: 'me', requestBody: {
            raw: buildMessage({ from, to: destination, contact: row.contact_email, subject: row.subject, link, messageId: `<${messageId}>` })
          }
        });
        receipt = data.id;
      }
      if (!/^[a-z0-9_-]+$/i.test(receipt || '')) throw new Error('Unconfirmed delivery');

      // If the process stopped during a send, subsequent passes reconcile the
      // fixed Message-ID in Sent without resending to an employment recipient.
      await db.execute(
        `INSERT IGNORE INTO employment_notice_automation_audit
           (notice_id,user_id,operation,automation_identity,result)
           VALUES (?,?,'personal_mail_accepted',?,JSON_OBJECT('mailReceipt',?))`,
        [row.notice_id, row.user_id, automationIdentity, receipt]
      );
      await db.execute(
        'UPDATE employment_notice_mail SET accepted_at=UTC_TIMESTAMP(3) WHERE delivery_id=? AND accepted_at IS NULL',
        [row.delivery_id]
      );
      accepted++;
    } catch {
      held++;
      await db.execute(
        `INSERT IGNORE INTO employment_notice_automation_audit
           (notice_id,user_id,operation,automation_identity,result)
           VALUES (?,?,'personal_mail_unconfirmed',?,JSON_OBJECT('reason','mail_or_receipt_unconfirmed'))`,
        [row.notice_id, row.user_id, automationIdentity]
      );
    }
  }
  return { due: rows.length, accepted, held };
}
