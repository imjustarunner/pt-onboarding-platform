import crypto from "node:crypto";
import bcrypt from "bcrypt";
import * as OTPAuth from "otpauth";
import { pool, seal, open, transaction } from "./repository.js";
import {
  fail,
  hash,
  json,
  text,
  PERMISSIONS,
  assertEmailType,
} from "./policy.js";

export const COOKIE = "auricwellSession";
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/auricwell",
  maxAge: 8 * 60 * 60 * 1000,
});
export function protectMutation(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("Origin");
  const allowed = new Set(
    (process.env.AURICWELL_ORIGINS || "https://auricwell.com")
      .split(",")
      .map((s) => s.trim()),
  );
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:5174");
    allowed.add("http://127.0.0.1:5174");
  }
  if (req.get("X-AuricWell") !== "1" || !allowed.has(origin))
    return next(
      fail(403, "Use the AuricWell application to make this change."),
    );
  next();
}
export async function authenticate(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!/^[a-f0-9]{64}$/.test(token || ""))
      throw fail(401, "Sign in to AuricWell.");
    const [rows] = await pool.execute(
      `SELECT a.*,s.token_hash,s.mfa_verified FROM auricwell_sessions s JOIN auricwell_accounts a ON a.id=s.account_id
      WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND s.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 20 MINUTE) AND a.status='active'`,
      [hash(token)],
    );
    if (!rows[0]) throw fail(401, "Your session expired. Sign in again.");
    const account = rows[0];
    const [[sms]] = await pool.execute('SELECT enabled FROM auricwell_auth_sms WHERE account_id=?', [account.id]);
    req.aw = {
      accountId: account.id,
      username: account.username,
      profile: open(account.profile, `auricwell:account:${account.id}`),
      verified: !!account.mfa_verified,
      sessionHash: account.token_hash,
      mfaEnabled: !!account.mfa_secret && Number(account.mfa_counter) >= 0,
      smsEnabled: !!sms?.enabled,
    };
    await pool.execute(
      "UPDATE auricwell_sessions SET last_seen_at=UTC_TIMESTAMP(3) WHERE token_hash=?",
      [account.token_hash],
    );
    next();
  } catch (e) {
    next(e);
  }
}
export async function requireVerified(req, _res, next) {
  try {
    const [memberships] = await pool.execute(
      "SELECT actor_type FROM auricwell_memberships WHERE account_id=? AND status='active'",
      [req.aw.accountId],
    );
    const required =
      req.aw.profile.operator ||
      req.aw.mfaEnabled ||
      req.aw.smsEnabled ||
      memberships.some((m) => m.actor_type === "staff");
    if (required && !req.aw.verified)
      throw fail(403, "Complete account verification.");
    next();
  } catch (e) {
    next(e);
  }
}
export async function practiceContext(req, _res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT p.*,m.permissions,m.patient_ids,m.billing_patient_ids,m.actor_type FROM auricwell_practices p
      JOIN auricwell_memberships m ON m.practice_id=p.id AND m.account_id=? AND m.status='active'
      WHERE p.slug=? AND p.product='auricwell_ehr' AND p.status IN ('setup','active')`,
      [req.aw.accountId, req.params.slug],
    );
    if (!rows[0]) throw fail(404, "Practice unavailable.");
    const p = rows[0];
    req.aw = {
      ...req.aw,
      practiceId: p.id,
      practiceName: p.name,
      slug: p.slug,
      agencyId: p.agency_id,
      actorType: p.actor_type,
      permissions: json(p.permissions, []),
      patientIds: json(p.patient_ids, []),
      billingPatientIds: json(p.billing_patient_ids, []),
      settings: open(p.settings, `auricwell:practice:${p.id}`),
      settingsRevision: p.revision,
    };
    const { settings: platform } = await (await import('./platformIntegrations.js')).platformIntegrations();
    req.aw.settings.capabilities.video = platform.videoProvider !== 'disabled';
    if (p.actor_type !== "staff" && !req.aw.settings.capabilities?.portal)
      throw fail(403, "The patient portal is not enabled for this practice.");
    next();
  } catch (e) {
    next(e);
  }
}
export async function login(username, password) {
  username = String(username || "")
    .trim()
    .toLowerCase();
  if (
    !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username) ||
    typeof password !== "string" ||
    password.length > 256
  )
    throw fail(401, "Invalid username or password.");
  return transaction(async (db) => {
    const [rows] = await db.execute(
      "SELECT * FROM auricwell_accounts WHERE username=? FOR UPDATE",
      [username],
    );
    const a = rows[0];
    const dummy =
      "$2b$12$X9HddAFrugWKgpRpFUgqJeoPrFEvjlbwfViaITZ6EWxMpSzZDWaUy";
    const valid = await bcrypt.compare(password, a?.password_hash || dummy);
    if (
      !a ||
      a.status !== "active" ||
      (a.locked_until && new Date(a.locked_until) > new Date()) ||
      !valid
    ) {
      if (a && !(a.locked_until && new Date(a.locked_until) > new Date()))
        await db.execute(
          "UPDATE auricwell_accounts SET failed_attempts=failed_attempts+1,locked_until=IF(failed_attempts>=5,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE),locked_until) WHERE id=?",
          [a.id],
        );
      return { error: fail(401, "Invalid username or password.") };
    }
    await db.execute(
      "UPDATE auricwell_accounts SET failed_attempts=0,locked_until=NULL WHERE id=?",
      [a.id],
    );
    const token = crypto.randomBytes(32).toString("hex");
    await db.execute(
      "INSERT INTO auricwell_sessions (token_hash,account_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 8 HOUR))",
      [hash(token), a.id],
    );
    return { token, mfaEnabled: !!a.mfa_secret && Number(a.mfa_counter) >= 0 };
  });
}
export async function beginMfa(ctx) {
  if (ctx.mfaEnabled) throw fail(409, "Authenticator is already enrolled.");
  const [[sms]] = await pool.execute('SELECT enabled FROM auricwell_auth_sms WHERE account_id=?', [ctx.accountId]);
  if(sms?.enabled && !ctx.verified) throw fail(403,'Verify your existing text-message security method before adding an authenticator.');
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  await pool.execute(
    "UPDATE auricwell_accounts SET mfa_secret=? WHERE id=? AND mfa_counter=-1",
    [seal(secret, `auricwell:mfa:${ctx.accountId}`), ctx.accountId],
  );
  const totp = new OTPAuth.TOTP({
    issuer: "AuricWell",
    label: ctx.username,
    secret,
  });
  return { secret, uri: totp.toString() };
}
export async function verifyMfa(ctx, code) {
  return transaction(async (db) => {
    const [[a]] = await db.execute(
      "SELECT * FROM auricwell_accounts WHERE id=? FOR UPDATE",
      [ctx.accountId],
    );
    if (!a?.mfa_secret) throw fail(409, "Enroll your authenticator first.");
    const [[sms]] = await db.execute('SELECT enabled FROM auricwell_auth_sms WHERE account_id=?', [ctx.accountId]);
    if(Number(a.mfa_counter)<0 && sms?.enabled && !ctx.verified)
      throw fail(403,'Verify your existing text-message security method before adding an authenticator.');
    const recoveries = json(a.recovery_hashes, []);
    const recoveryIndex = recoveries.indexOf(
      hash(
        String(code || "")
          .replaceAll("-", "")
          .toLowerCase(),
      ),
    );
    let counter = -1;
    if (recoveryIndex < 0) {
      const totp = new OTPAuth.TOTP({
        secret: open(a.mfa_secret, `auricwell:mfa:${a.id}`),
      });
      const delta = totp.validate({ token: String(code || ""), window: 1 });
      if (delta !== null) counter = Math.floor(Date.now() / 30000) + delta;
      if (counter <= Number(a.mfa_counter))
        throw fail(401, "Invalid or already used authenticator code.");
    }
    const first = Number(a.mfa_counter) < 0;
    const codes = first
      ? Array.from({ length: 10 }, () => crypto.randomBytes(16).toString("hex"))
      : [];
    if (recoveryIndex >= 0) recoveries.splice(recoveryIndex, 1);
    await db.execute(
      "UPDATE auricwell_accounts SET mfa_counter=?,recovery_hashes=? WHERE id=?",
      [
        Math.max(counter, Number(a.mfa_counter)),
        JSON.stringify(first ? codes.map(hash) : recoveries),
        a.id,
      ],
    );
    await db.execute(
      "UPDATE auricwell_sessions SET mfa_verified=1 WHERE token_hash=? AND account_id=?",
      [ctx.sessionHash, a.id],
    );
    return { verified: true, recoveryCodes: codes };
  });
}
export async function createAccount(
  { username, name, email, password, operator = false },
  db = pool,
) {
  username = String(username || "")
    .toLowerCase()
    .trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username))
    throw fail(
      400,
      "Use a unique username of 3–80 letters, numbers, dots, underscores or hyphens.",
    );
  if (
    password &&
    (password.length < 14 ||
      password.length > 256 ||
      Buffer.byteLength(password) > 72)
  )
    throw fail(
      400,
      "Use a password of at least 14 characters and at most 72 UTF-8 bytes.",
    );
  if (
    email &&
    (typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    throw fail(400, "Enter a valid account email.");
  const id = crypto.randomUUID();
  await db.execute(
    "INSERT INTO auricwell_accounts (id,username,password_hash,profile,status) VALUES (?,?,?,?,?)",
    [
      id,
      username,
      password ? await bcrypt.hash(password, 12) : null,
      seal(
        { name: text(name, "Name", 200), email: email || "", operator },
        `auricwell:account:${id}`,
      ),
      password ? "active" : "pending",
    ],
  );
  return { id, username };
}
export async function sendAccountLink(accountId, purpose, { agencyId = null } = {}) {
  assertEmailType(purpose);
  const [[account]] = await pool.execute(
    "SELECT * FROM auricwell_accounts WHERE id=?",
    [accountId],
  );
  if (!account) throw fail(404, "Account unavailable.");
  const profile = open(account.profile, `auricwell:account:${accountId}`);
  if (!profile.email || (!agencyId && !/^notifications@[^@]+$/i.test(process.env.AURICWELL_ACCOUNT_EMAIL_FROM || "")))
    throw fail(
      409,
      "Configure the AuricWell account email sender and recipient before sending.",
    );
  const token = crypto.randomBytes(32).toString("hex");
  await pool.execute(
    "INSERT INTO auricwell_account_tokens (token_hash,account_id,purpose,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 HOUR))",
    [hash(token), accountId, purpose],
  );
  const { default: EmailService } = await import("../email.service.js");
  const message = {
    to: profile.email,
    fromAddress: process.env.AURICWELL_ACCOUNT_EMAIL_FROM,
    fromName: "AuricWell",
    replyTo: process.env.AURICWELL_ACCOUNT_EMAIL_FROM?.replace(/^notifications@/i,"support@"),
    subject: "Your AuricWell account",
    text: `Set your AuricWell password. Username: ${account.username}\n${process.env.AURICWELL_PUBLIC_ORIGIN || "https://auricwell.com"}/app#accountToken=${token}\nThis link expires in one hour.`,
    source: "manual",
    templateType: `auricwell_account_${purpose}`,
  };
  if (agencyId) {
    const { clientEmailContext, sendClientPortalEmail } = await import('../clientPortalEmail.service.js');
    const { portalActionHtml } = await import('../clientPortalEmailContent.js');
    const { escapePortalHtml } = await import('../portalEmailBranding.service.js');
    const { fromAddress, fromName, replyTo, ...tenantMessage } = message;
    const context=await clientEmailContext({agencyId,clinical:true});
    const url=`${process.env.AURICWELL_PUBLIC_ORIGIN || 'https://auricwell.com'}/app#accountToken=${token}`;
    const result=await sendClientPortalEmail({agencyId,context,...tenantMessage,html:`<p>Set your AuricWell password. Username: ${escapePortalHtml(account.username)}</p>${portalActionHtml(purpose==='recovery'?'Reset your password':'Set up your AuricWell account',url)}<p>This link expires in one hour.</p>`});
    const sent=!!result?.id&&!result.queued&&!result.pendingApproval&&!result.skipped&&!result.blocked&&!result.redirected;
    return {...result,sent,deliveryStatus:sent?'sent':'pending'};
  }
  const {portalActionHtml}=await import('../clientPortalEmailContent.js');
  const {enrollmentMailBrand,renderPortalEmail,escapePortalHtml}=await import('../portalEmailBranding.service.js');
  const brand=enrollmentMailBrand({agency:{name:'AuricWell'},domain:'auricwell.com',clinicalOverride:true});
  message.html=renderPortalEmail({brand,html:`<p>Set your AuricWell password. Username: ${escapePortalHtml(account.username)}</p>${portalActionHtml(purpose==='recovery'?'Reset your password':'Set up your AuricWell account',`${process.env.AURICWELL_PUBLIC_ORIGIN || 'https://auricwell.com'}/app#accountToken=${token}`)}<p>This link expires in one hour.</p>`});
  const result = await EmailService.sendEmail(message);
  const sent = !!result?.id && !result.queued && !result.skipped && !result.blocked && !result.redirected;
  return {...result,sent,deliveryStatus:sent?'sent':'pending'};
}
export async function redeemAccountToken(token, password) {
  if (
    typeof password !== "string" ||
    password.length < 14 ||
    Buffer.byteLength(password) > 72
  )
    throw fail(400, "Use at least 14 characters and at most 72 UTF-8 bytes.");
  return transaction(async (db) => {
    const [[row]] = await db.execute(
      "SELECT * FROM auricwell_account_tokens WHERE token_hash=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",
      [hash(token)],
    );
    if (!row) throw fail(400, "This account link is invalid or expired.");
    await db.execute(
      "UPDATE auricwell_accounts SET password_hash=?,status='active',failed_attempts=0,locked_until=NULL WHERE id=?",
      [await bcrypt.hash(password, 12), row.account_id],
    );
    await db.execute(
      "UPDATE auricwell_account_tokens SET consumed_at=UTC_TIMESTAMP(3) WHERE account_id=? AND consumed_at IS NULL",
      [row.account_id],
    );
    await db.execute("DELETE FROM auricwell_sessions WHERE account_id=?", [
      row.account_id,
    ]);
    return { completed: true };
  });
}
export function validatePermissions(values) {
  if (!Array.isArray(values) || values.some((p) => !PERMISSIONS.includes(p)))
    throw fail(400, "Invalid practice permissions.");
  return [...new Set(values)];
}
