import { createHash, randomBytes } from 'node:crypto';
import pool from '../config/database.js';

export const NOTICE_REQUIRED = 'EMPLOYMENT_NOTICE_REQUIRED';
export const ACKNOWLEDGMENT = 'I acknowledge that I received this notice and was provided access to the full leadership communication.';

const digest = key => createHash('sha256').update(key).digest();

export async function assertEmploymentNoticeAccess(claims, { existingSession = false, db = pool } = {}) {
  if (process.env.EMPLOYMENT_NOTICE_ENABLED !== 'true') return;
  const id = Number(claims?.id);
  const approvedEmail = claims?.type === 'approved_employee' ? claims.email : null;
  const userId = Number.isSafeInteger(id) && id > 0 ? id : null;
  if (!userId && !approvedEmail) return;
  const [[notice]] = await db.execute(
    `SELECT n.id, r.user_id,
            UTC_TIMESTAMP(3) < n.restrict_until AS restricted
       FROM employment_notice_recipients r JOIN employment_notices n ON n.id=r.notice_id
      WHERE r.user_id=COALESCE(?, (SELECT id FROM users WHERE email=? LIMIT 1))
        AND n.restrict_from <= UTC_TIMESTAMP(3)
        AND (UTC_TIMESTAMP(3) < n.restrict_until OR ? < UNIX_TIMESTAMP(n.restrict_from))
      ORDER BY n.restrict_from DESC LIMIT 1`,
    [userId, approvedEmail ?? null, existingSession ? Number(claims.iat || 0) : Number.MAX_SAFE_INTEGER]
  );
  if (!notice) return;
  if (!notice.restricted) throw Object.assign(new Error('Your previous session ended. Please sign in again.'), { status: 401, code: 'SESSION_EXPIRED' });
  throw Object.assign(new Error('Open your employment notice.'), {
    status: 403, code: NOTICE_REQUIRED, recipient: { noticeId: notice.id, userId: notice.user_id }
  });
}

export async function issueSignInNoticeKey({ noticeId, userId }, db = pool) {
  const key = randomBytes(32).toString('base64url');
  const [result] = await db.execute(
    `INSERT INTO employment_notice_keys (digest,notice_id,user_id,channel,expires_at)
       SELECT ?,n.id,r.user_id,'sign_in',LEAST(n.restrict_until,UTC_TIMESTAMP(3)+INTERVAL 30 MINUTE)
       FROM employment_notices n JOIN employment_notice_recipients r ON r.notice_id=n.id
       WHERE n.id=? AND r.user_id=? AND UTC_TIMESTAMP(3)>=n.restrict_from AND UTC_TIMESTAMP(3)<n.restrict_until`,
    [digest(key), noticeId, userId]
  );
  if (!result.affectedRows) throw Object.assign(new Error('Please sign in again.'), { status: 401, code: 'SESSION_EXPIRED' });
  return key;
}

async function readNotice(key, db) {
  if (process.env.EMPLOYMENT_NOTICE_ENABLED !== 'true' || typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key)) return null;
  const [[notice]] = await db.execute(
    `SELECT n.id, k.user_id, k.channel, n.version, n.subject, n.letter, n.contact_email,
            n.restrict_from, n.restrict_until, UTC_TIMESTAMP(3)<n.restrict_until AS restriction_pending, a.acknowledged_at
       FROM employment_notice_keys k JOIN employment_notices n ON n.id=k.notice_id
       LEFT JOIN employment_notice_receipts a ON a.notice_id=k.notice_id AND a.user_id=k.user_id
      WHERE k.digest=? AND UTC_TIMESTAMP(3)>=n.publish_at AND UTC_TIMESTAMP(3)<k.expires_at`,
    [digest(key)]
  );
  return notice ?? null;
}

export async function getEmploymentNotice(key, db = pool) {
  const notice = await readNotice(key, db);
  if (!notice) return null;
  return {
    version: notice.version,
    subject: notice.subject,
    letter: notice.letter,
    contactEmail: notice.contact_email,
    restrictFrom: notice.restrict_from,
    restrictUntil: notice.restrict_until,
    restrictionPending: Boolean(notice.restriction_pending),
    acknowledgment: ACKNOWLEDGMENT,
    acknowledgedAt: notice.acknowledged_at
  };
}

export async function acknowledgeEmploymentNotice({ key, version, acknowledged }, db = pool) {
  if (acknowledged !== true || typeof version !== 'string') {
    throw Object.assign(new Error('Check the box to acknowledge receipt.'), { status: 400 });
  }
  const notice = await readNotice(key, db);
  if (!notice || notice.version !== version) return null;
  await db.execute(
    `INSERT INTO employment_notice_receipts (notice_id,user_id,channel,acknowledgment)
       SELECT k.notice_id,k.user_id,k.channel,? FROM employment_notice_keys k
       JOIN employment_notices n ON n.id=k.notice_id
       WHERE k.digest=? AND n.version=? AND UTC_TIMESTAMP(3)>=n.publish_at AND UTC_TIMESTAMP(3)<k.expires_at
       ON DUPLICATE KEY UPDATE acknowledged_at=employment_notice_receipts.acknowledged_at`,
    [ACKNOWLEDGMENT, digest(key), version]
  );
  const [[receipt]] = await db.execute(
    'SELECT acknowledged_at FROM employment_notice_receipts WHERE notice_id=? AND user_id=?',
    [notice.id, notice.user_id]
  );
  return receipt ? { acknowledgedAt: receipt.acknowledged_at } : null;
}
