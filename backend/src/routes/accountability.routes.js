import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.middleware.js';
import StorageService from '../services/storage.service.js';
import EmailService from '../services/email.service.js';
import { resolveSenderIdentityForSend } from '../services/emailSenderIdentityResolver.service.js';
import { createAccountabilityPdf } from '../services/accountabilityPdf.service.js';
import { invalid, parseJson, validateSettings, validateReport, monthValue, reportTotals } from '../utils/accountability.js';
import { canAccessAccountability, isAccountabilityParticipant } from '../utils/accountabilityAccess.js';

const router = express.Router();
router.use(authenticate);
const run = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 } });
const positiveId = (v) => { const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) throw invalid('Invalid identifier.'); return n; };

async function access(req, db = pool) {
  const agencyId = positiveId(req.params.agencyId);
  const actorId = Number(req.user.id);
  const userId = req.query?.userId == null ? actorId : positiveId(req.query.userId);
  const delegated = userId !== actorId;
  if (delegated && req.user.role !== 'super_admin') throw invalid('Only a superadmin can prepare another participant’s report.', 403);
  if (delegated && !isAccountabilityParticipant(userId, agencyId)) throw invalid('This participant is not approved for this company.', 403);
  if (!canAccessAccountability(actorId, agencyId)) throw invalid('This workspace is restricted to the three approved work accounts.', 403);
  const [[agency]] = await db.execute('SELECT id, name FROM agencies WHERE id = ?', [agencyId]);
  if (!agency) throw invalid('Organization not found.', 404);
  const [[membership]] = await db.execute('SELECT has_payroll_access FROM user_agencies WHERE agency_id = ? AND user_id = ?', [agencyId, actorId]);
  const manager = req.user.role === 'super_admin' || !!Number(membership?.has_payroll_access);
  if (!membership && !manager) throw invalid('Organization access required.', 403);
  if (delegated) {
    const [[targetMember]] = await db.execute('SELECT user_id FROM user_agencies WHERE agency_id = ? AND user_id = ?', [agencyId, userId]);
    if (!targetMember) throw invalid('Participant is not a member of this organization.', 403);
  }
  const [[grant]] = await db.execute('SELECT * FROM accountability_grants WHERE agency_id = ? AND user_id = ?', [agencyId, userId]);
  return { agencyId, userId, actorId, delegated, agency, manager, grant: isAccountabilityParticipant(userId, agencyId) && grant && Number(grant.enabled) ? parseJson(grant.settings_json) : null };
}
async function report(req, db = pool, lock = false) {
  const ctx = await access(req, db);
  const [[row]] = await db.execute(`SELECT * FROM accountability_reports WHERE id = ? AND agency_id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`, [positiveId(req.params.reportId), ctx.agencyId, ctx.userId]);
  if (!row) throw invalid('Report not found.', 404);
  if (!ctx.grant) throw invalid('Home office accountability access is not enabled.', 403);
  return { ...ctx, row };
}
function draft(row, version) {
  if (row.status !== 'draft') throw invalid('Signed reports are locked.', 409);
  if (Number(version) !== row.version) throw invalid('This report changed in another window. Reload it before saving.', 409);
}
async function transaction(fn) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await fn(db); await db.commit(); return result; }
  catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
async function receiptRows(id, db = pool) {
  const [rows] = await db.execute('SELECT * FROM accountability_receipts WHERE report_id = ? ORDER BY id', [id]);
  return rows;
}
async function payload(row, settings) {
  const data = parseJson(row.data_json);
  const snapshot = parseJson(row.snapshot_json);
  const receipts = (await receiptRows(row.id)).map(({ storage_key, ...r }) => r);
  return { id: row.id, month: row.report_month, status: row.status, version: row.version, data, settings: snapshot?.settings || settings, receipts, totals: reportTotals(data, snapshot?.settings || settings), deliveryStatus: row.delivery_status, deliveryDetail: row.delivery_detail, signedAt: row.signed_at };
}

// Discover permitted person/company pairs without changing the global organization.
router.get('/workspaces', run(async (req, res) => {
  const actorId = Number(req.user.id);
  if (![1, 2].some(id => canAccessAccountability(actorId, id))) throw invalid('This workspace is restricted to the three approved work accounts.', 403);
  const manageAll = req.user.role === 'super_admin';
  const [rows] = await pool.execute(`SELECT a.id AS agency_id, a.name AS agency_name, u.id AS user_id,
    u.first_name, u.last_name, g.enabled
    FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id JOIN users u ON u.id=ua.user_id
    LEFT JOIN accountability_grants g ON g.agency_id=ua.agency_id AND g.user_id=ua.user_id
    WHERE ua.agency_id IN (1,2) AND u.id IN (501,507,538) ORDER BY u.last_name,u.first_name,a.name`);
  res.json(rows.filter(r => isAccountabilityParticipant(r.user_id, r.agency_id) && (manageAll || Number(r.user_id) === actorId))
    .map(r => ({ agencyId: Number(r.agency_id), agencyName: r.agency_name, userId: Number(r.user_id), userName: `${r.first_name} ${r.last_name}`, enabled: !!Number(r.enabled), isSelf: Number(r.user_id) === actorId })));
}));

// Private setup files carry personal plan information; it is never seeded in source code.
router.post('/plan-setup', run(async (req, res) => {
  if (req.user.role !== 'super_admin' || !canAccessAccountability(req.user.id, 2)) throw invalid('Approved superadmin access required.', 403);
  const plans = req.body.plans;
  if (!Array.isArray(plans) || !plans.length || plans.length > 4) throw invalid('Choose a setup file with 1–4 approved plans.');
  const seen = new Set();
  const entries = plans.map(p => {
    const agencyId = positiveId(p.agencyId), userId = positiveId(p.userId), key = `${agencyId}:${userId}`;
    if (!isAccountabilityParticipant(userId, agencyId) || seen.has(key)) throw invalid('Each plan must identify a unique approved participant and company.');
    seen.add(key);
    if (typeof p.enabled !== 'boolean') throw invalid('Each plan must explicitly set its permission.');
    return { agencyId, userId, enabled: p.enabled, settings: validateSettings(p.settings) };
  });
  await transaction(async db => {
    for (const p of entries) {
      const [[member]] = await db.execute('SELECT user_id FROM user_agencies WHERE agency_id = ? AND user_id = ?', [p.agencyId, p.userId]);
      if (!member) throw invalid('A plan participant is not a member of its organization.');
      await db.execute(`INSERT INTO accountability_grants (agency_id,user_id,enabled,settings_json,updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),settings_json=VALUES(settings_json),updated_by=VALUES(updated_by)`, [p.agencyId, p.userId, p.enabled ? 1 : 0, JSON.stringify(p.settings), Number(req.user.id)]);
    }
  });
  res.json({ saved: entries.length });
}));

router.get('/:agencyId/access', run(async (req, res) => {
  const ctx = await access(req);
  res.json({ enabled: !!ctx.grant, manager: ctx.manager, settings: ctx.grant, delegated: ctx.delegated, canManageAll: req.user.role === 'super_admin' });
}));
router.get('/:agencyId/settings', run(async (req, res) => {
  const ctx = await access(req);
  if (!ctx.manager) throw invalid('Payroll management access required.', 403);
  const [users] = await pool.execute(`SELECT u.id, u.first_name, u.last_name, u.email FROM users u JOIN user_agencies ua ON ua.user_id = u.id WHERE ua.agency_id = ? ORDER BY u.last_name,u.first_name`, [ctx.agencyId]);
  const [grants] = await pool.execute('SELECT user_id, enabled, settings_json FROM accountability_grants WHERE agency_id = ?', [ctx.agencyId]);
  res.json({ users: users.filter(u => isAccountabilityParticipant(u.id, ctx.agencyId)), grants: grants.filter(g => isAccountabilityParticipant(g.user_id, ctx.agencyId)).map((g) => ({ userId: g.user_id, enabled: !!Number(g.enabled), settings: parseJson(g.settings_json) })) });
}));
router.put('/:agencyId/settings/:userId', run(async (req, res) => {
  const ctx = await access(req);
  if (!ctx.manager) throw invalid('Payroll management access required.', 403);
  const userId = positiveId(req.params.userId);
  if (!isAccountabilityParticipant(userId, ctx.agencyId)) throw invalid('Only the approved work accounts can receive permission for this company.', 403);
  const [[member]] = await pool.execute('SELECT user_id FROM user_agencies WHERE agency_id = ? AND user_id = ?', [ctx.agencyId, userId]);
  if (!member) throw invalid('Select a member of this organization.');
  if (typeof req.body.enabled !== 'boolean') throw invalid('Enabled must be true or false.');
  const settings = validateSettings(req.body.settings || {});
  await pool.execute(`INSERT INTO accountability_grants (agency_id,user_id,enabled,settings_json,updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),settings_json=VALUES(settings_json),updated_by=VALUES(updated_by)`, [ctx.agencyId, userId, req.body.enabled ? 1 : 0, JSON.stringify(settings), ctx.userId]);
  res.json({ ok: true });
}));
router.get('/:agencyId/reports', run(async (req, res) => {
  const ctx = await access(req);
  if (!ctx.grant) throw invalid('Home office accountability access is not enabled.', 403);
  const [rows] = await pool.execute('SELECT id,report_month,status,delivery_status FROM accountability_reports WHERE agency_id = ? AND user_id = ? ORDER BY report_month DESC', [ctx.agencyId, ctx.userId]);
  res.json(rows);
}));
router.post('/:agencyId/reports', run(async (req, res) => {
  const ctx = await access(req);
  if (!ctx.grant) throw invalid('Home office accountability access is not enabled.', 403);
  const month = monthValue(req.body.month);
  await pool.execute(`INSERT INTO accountability_reports (agency_id,user_id,report_month,data_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE id=id`, [ctx.agencyId, ctx.userId, month, JSON.stringify({ expenses: [], mileage: [] })]);
  const [[row]] = await pool.execute('SELECT * FROM accountability_reports WHERE agency_id = ? AND user_id = ? AND report_month = ?', [ctx.agencyId, ctx.userId, month]);
  res.json(await payload(row, ctx.grant));
}));
router.put('/:agencyId/reports/:reportId', run(async (req, res) => {
  const result = await transaction(async (db) => {
    const ctx = await report(req, db, true);
    draft(ctx.row, req.body.version);
    const data = validateReport(req.body.data, ctx.row.report_month, ctx.grant);
    const receipts = await receiptRows(ctx.row.id, db);
    if (receipts.some((r) => !data.expenses.some((e) => e.id === r.expense_id))) throw invalid('Remove attached receipts before removing their expense.');
    await db.execute('UPDATE accountability_reports SET data_json = ?,version = version+1 WHERE id = ?', [JSON.stringify(data), ctx.row.id]);
    return { ...ctx.row, data_json: data, version: ctx.row.version + 1, settings: ctx.grant };
  });
  res.json(await payload(result, result.settings));
}));
router.post('/:agencyId/reports/:reportId/receipts', async (req, res, next) => { try { await report(req); next(); } catch (error) { next(error); } }, upload.single('receipt'), run(async (req, res) => {
  res.json(await transaction(async (db) => {
    const ctx = await report(req, db, true);
    draft(ctx.row, req.body.version);
    const data = parseJson(ctx.row.data_json);
    if (!data.expenses.some((e) => e.id === req.body.expenseId)) throw invalid('Save the expense before attaching its receipt.');
    const file = req.file;
    if (!file) throw invalid('Choose a PDF, PNG, or JPEG receipt.');
    const receipts = await receiptRows(ctx.row.id, db);
    if (receipts.length >= 30 || receipts.reduce((s, r) => s + r.size_bytes, 0) + file.size > 12 * 1024 * 1024) throw invalid('A report can contain up to 30 receipts totaling 12 MB.');
    let mime;
    try {
      if (file.buffer.subarray(0, 5).toString() === '%PDF-') {
        const pdf = await PDFDocument.load(file.buffer);
        if (pdf.getPageCount() > 20) throw new Error('Too many pages');
        mime = 'application/pdf';
      } else {
        const pdf = await PDFDocument.create();
        const png = file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        const img = png ? await pdf.embedPng(file.buffer) : await pdf.embedJpg(file.buffer);
        if (img.width * img.height > 25000000) throw new Error('Image too large');
        mime = png ? 'image/png' : 'image/jpeg';
      }
    } catch { throw invalid('Use a readable, unencrypted PDF (up to 20 pages), PNG, or JPEG receipt.'); }
    const key = `accountability/${ctx.agencyId}/${ctx.userId}/${ctx.row.id}/receipts/${crypto.randomUUID()}`;
    await StorageService.writeObject(key, file.buffer, mime);
    await db.execute('INSERT INTO accountability_receipts (report_id,expense_id,storage_key,original_name,mime_type,size_bytes) VALUES (?,?,?,?,?,?)', [ctx.row.id, req.body.expenseId, key, String(file.originalname).replace(/[\r\n/\\]/g, '_').slice(0, 200), mime, file.size]);
    await db.execute('UPDATE accountability_reports SET version=version+1 WHERE id=?', [ctx.row.id]);
    return { ok: true };
  }));
}));
router.delete('/:agencyId/reports/:reportId/receipts/:receiptId', run(async (req, res) => {
  const storageKey = await transaction(async (db) => {
    const ctx = await report(req, db, true);
    draft(ctx.row, req.body.version);
    const [[receipt]] = await db.execute('SELECT * FROM accountability_receipts WHERE id=? AND report_id=?', [positiveId(req.params.receiptId), ctx.row.id]);
    if (!receipt) throw invalid('Receipt not found.', 404);
    await db.execute('DELETE FROM accountability_receipts WHERE id=? AND report_id=?', [receipt.id, ctx.row.id]);
    await db.execute('UPDATE accountability_reports SET version=version+1 WHERE id=?', [ctx.row.id]);
    return receipt.storage_key;
  });
  // Metadata removal commits before cleanup, so rollback never restores a broken link.
  try { const bucket = await StorageService.getGCSBucket(); await bucket.file(storageKey).delete({ ignoreNotFound: true }); }
  catch (error) { console.warn('[accountability] Receipt cleanup deferred:', error.message); }
  res.json({ ok: true });
}));
router.get('/:agencyId/reports/:reportId/receipts/:receiptId', run(async (req, res) => {
  const ctx = await report(req);
  const receipts = await receiptRows(ctx.row.id);
  const receipt = receipts.find((r) => r.id === positiveId(req.params.receiptId));
  if (!receipt) throw invalid('Receipt not found.', 404);
  const bytes = await StorageService.readObject(receipt.storage_key);
  res.set({ 'Content-Type': receipt.mime_type, 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="receipt-${receipt.id}.${receipt.mime_type === 'application/pdf' ? 'pdf' : receipt.mime_type === 'image/png' ? 'png' : 'jpg'}"` }).send(bytes);
}));
async function snapshotFor(ctx, db = pool) {
  const [[user]] = await db.execute('SELECT first_name,last_name FROM users WHERE id=?', [ctx.userId]);
  return { reportId: ctx.row.id, userId: ctx.userId, agencyName: ctx.agency.name, userName: `${user.first_name} ${user.last_name}`, month: ctx.row.report_month, settings: ctx.grant, data: parseJson(ctx.row.data_json) };
}
async function receiptBytes(id, db = pool) {
  const rows = await receiptRows(id, db);
  for (const row of rows) row.bytes = await StorageService.readObject(row.storage_key);
  return rows;
}
router.get('/:agencyId/reports/:reportId/pdf', run(async (req, res) => {
  const ctx = await report(req);
  const bytes = ctx.row.pdf_key ? await StorageService.readObject(ctx.row.pdf_key) : await createAccountabilityPdf({ snapshot: await snapshotFor(ctx), receipts: await receiptBytes(ctx.row.id) });
  res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'Content-Disposition': `inline; filename="accountability-${ctx.row.report_month}.pdf"` }).send(bytes);
}));
router.post('/:agencyId/reports/:reportId/sign', run(async (req, res) => {
  await transaction(async (db) => {
    const ctx = await report(req, db, true);
    if (ctx.delegated) throw invalid('The participant must sign their own report.', 403);
    draft(ctx.row, req.body.version);
    if (JSON.stringify(req.body.settings) !== JSON.stringify(ctx.grant)) throw invalid('Your plan parameters changed. Reload and review them before signing.', 409);
    if (req.body.attested !== true) throw invalid('Accept the certification before signing.');
    const signature = String(req.body.signature || '');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 200000) throw invalid('Draw and save your signature.');
    const receipts = await receiptBytes(ctx.row.id, db);
    const snapshot = await snapshotFor(ctx, db);
    snapshot.data = validateReport(snapshot.data, ctx.row.report_month, ctx.grant, { final: true, receipts });
    snapshot.signedAt = new Date().toISOString();
    let bytes;
    try { bytes = await createAccountabilityPdf({ snapshot, receipts, signature }); }
    catch { throw invalid('The PDF could not be generated. Check the signature and receipt files.'); }
    if (bytes.length > 15 * 1024 * 1024) throw invalid('The combined PDF is too large to email. Reduce the receipt sizes.');
    const key = `accountability/${ctx.agencyId}/${ctx.userId}/${ctx.row.id}/signed-${crypto.randomUUID()}.pdf`;
    await StorageService.writeObject(key, bytes, 'application/pdf');
    await db.execute("UPDATE accountability_reports SET status='signed',snapshot_json=?,pdf_key=?,signed_at=UTC_TIMESTAMP(),version=version+1 WHERE id=?", [JSON.stringify(snapshot), key, ctx.row.id]);
  });
  res.json({ ok: true });
}));
router.post('/:agencyId/reports/:reportId/send', run(async (req, res) => {
  const ctx = await report(req);
  if (ctx.row.status !== 'signed') throw invalid('Sign the report before sending.');
  const [claim] = await pool.execute("UPDATE accountability_reports SET delivery_status='sending',delivery_detail='Delivery in progress. If this persists, check the organization email log.' WHERE id=? AND delivery_status IN ('not_sent','failed')", [ctx.row.id]);
  if (!claim.affectedRows) throw invalid('This report is already sent or awaiting delivery confirmation. Reload to see its status.', 409);
  let status = 'unknown';
  let detail = 'Delivery could not be confirmed. Check the email log before attempting another send.';
  let attemptedSend = false;
  try {
    const snapshot = parseJson(ctx.row.snapshot_json);
    const bytes = await StorageService.readObject(ctx.row.pdf_key);
    const { identity } = await resolveSenderIdentityForSend({ agencyId: ctx.agencyId, templateType: 'accountability_report' });
    attemptedSend = true;
    const result = await EmailService.sendEmail({
      to: snapshot.settings.recipient, subject: `${snapshot.agencyName} accountability report - ${snapshot.month} - ${snapshot.userName}`,
      text: `The signed monthly accountability report for ${snapshot.userName} (${snapshot.month}) is attached, including supporting receipts.`,
      fromName: identity?.display_name || identity?.from_name || snapshot.agencyName, fromAddress: identity?.from_email || null,
      agencyId: ctx.agencyId, userId: ctx.userId, generatedByUserId: ctx.actorId, source: 'manual', templateType: 'accountability_report',
      attachments: [{ filename: `accountability-${snapshot.month}.pdf`, contentType: 'application/pdf', contentBase64: bytes.toString('base64') }]
    });
    if (result?.skipped || result?.blocked) { status = 'failed'; detail = 'Email was not sent. Check organization email settings before retrying.'; }
    else if (result?.queued || result?.pendingApproval) { status = 'queued'; detail = 'Email is queued or awaiting approval. Check the email log for delivery.'; }
    else if (result?.redirected) { status = 'redirected'; detail = 'Email was redirected by test/demo settings; it was not delivered to the configured recipient.'; }
    else if (result?.id || result?.messageId) { status = 'sent'; detail = 'Email accepted by the email provider.'; }
  } catch (error) {
    if (!attemptedSend) { status = 'failed'; detail = 'Email was not attempted. Check file storage and email configuration, then retry.'; }
    console.error('[accountability] Delivery not confirmed:', error.message);
  }
  await pool.execute("UPDATE accountability_reports SET delivery_status=?,delivery_detail=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL) WHERE id=?", [status, detail, status, ctx.row.id]);
  res.json({ deliveryStatus: status, deliveryDetail: detail });
}));

export default router;
