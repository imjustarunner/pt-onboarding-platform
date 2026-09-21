import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import User from '../models/User.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import StorageService from './storage.service.js';
import pool from '../config/database.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

export async function appendApplicationJobDescription(receiptBytes, submission) {
  const doc = submission.intake_data?.applicationRecord?.documents?.find(d => d.kind === 'job_description');
  if (!doc) return receiptBytes;
  const [[stored]] = await pool.execute('SELECT storage_path, mime_type FROM user_admin_docs WHERE id = ? AND user_id = ?', [doc.id, submission.guardian_user_id]);
  if (!stored?.storage_path || stored.mime_type !== 'application/pdf') return receiptBytes;
  try {
    const receipt = await PDFDocument.load(receiptBytes);
    const job = await PDFDocument.load(await StorageService.readObject(stored.storage_path));
    for (const page of await receipt.copyPages(job, job.getPageIndices())) receipt.addPage(page);
    return Buffer.from(await receipt.save());
  } catch (error) {
    // The retained original remains available through its protected receipt link.
    console.warn('[application receipt] could not append job PDF:', error?.message);
    return receiptBytes;
  }
}

export function applicationSnapshot({ applicant, job, documents, signature, submittedAt }) {
  return { version: 1, applicant, submittedAt,
    jobDescription: job ? { id: job.id, title: job.title, descriptionText: job.description_text,
      descriptionSections: typeof job.description_sections_json === 'string' ? JSON.parse(job.description_sections_json || '{}') : job.description_sections_json,
      role: job.role_type, city: job.city, state: job.state, schedule: job.schedule_text } : null,
    documents, signature };
}

export function applicationDocumentUrl(agency, submission, docId) {
  if (!submission?.registration_receipt_token) return '';
  const origin = new URL(buildPublicAppUrl(agency)).origin;
  return `${origin}/api/public-intake/application-documents/${submission.id}/${docId}?token=${encodeURIComponent(submission.registration_receipt_token)}`;
}

// Rendering old records can recover identity from the applicant account. New
// records always use the identity and job text captured when the person applied.
export async function enrichApplicationRecord(submission, link, agency) {
  if (link?.form_type !== 'job_application' || !submission?.id) return submission;
  const data = typeof submission.intake_data === 'string' ? JSON.parse(submission.intake_data || '{}') : { ...(submission.intake_data || {}) };
  let record = data.applicationRecord;
  if (!record && submission.guardian_user_id) {
    const user = await User.findById(submission.guardian_user_id);
    const job = link.job_description_id ? await HiringJobDescription.findById(link.job_description_id) : null;
    const [docs] = await pool.execute(`SELECT id, title, original_name FROM user_admin_docs
      WHERE user_id = ? AND doc_type IN ('resume','cover_letter','application_material')
        AND created_at BETWEEN DATE_SUB(?, INTERVAL 15 MINUTE) AND DATE_ADD(?, INTERVAL 15 MINUTE)
      ORDER BY id`, [submission.guardian_user_id, submission.submitted_at, submission.submitted_at]);
    record = applicationSnapshot({ applicant: { firstName: user?.first_name, lastName: user?.last_name, email: user?.email, phone: user?.phone_number },
      job: job && Number(job.agency_id) === Number(agency.id) ? job : null,
      documents: docs.map(doc => ({ id: doc.id, title: doc.title, name: doc.original_name })),
      signature: data.referenceReleaseSignature || data.responses?.submission?.referenceReleaseSignature || data.submission?.referenceReleaseSignature,
      submittedAt: submission.submitted_at });
    record.jobDescriptionSource = 'current';
    // Enrich legacy receipts without changing their original signed payload.
    submission = { ...submission, registration_receipt_token: await issueApplicationReceiptToken(submission) };
  }
  if (record) data.applicationRecord = { ...record,
    documents: (record.documents || []).map(doc => ({ ...doc, href: applicationDocumentUrl(agency, submission, doc.id) })) };
  return { ...submission, intake_data: data };
}

export async function issueApplicationReceiptToken(submission) {
  if (submission.registration_receipt_token) return submission.registration_receipt_token;
  const token = randomBytes(32).toString('hex');
  await pool.execute("UPDATE intake_submissions SET registration_receipt_token = ? WHERE id = ? AND (registration_receipt_token IS NULL OR registration_receipt_token = '')", [token, submission.id]);
  return (await IntakeSubmission.findById(submission.id)).registration_receipt_token;
}

export async function viewApplicationDocument(req, res, next) {
  try {
    const submission = await IntakeSubmission.findById(Number(req.params.submissionId));
    const provided = Buffer.from(String(req.query.token || ''));
    const expected = Buffer.from(String(submission?.registration_receipt_token || ''));
    if (!expected.length || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return res.sendStatus(404);
    const link = await IntakeLink.findById(submission.intake_link_id);
    if (link?.form_type !== 'job_application' || submission.status !== 'submitted') return res.sendStatus(404);
    const data = typeof submission.intake_data === 'string' ? JSON.parse(submission.intake_data) : submission.intake_data;
    const docId = Number(req.params.docId);
    if (data?.applicationRecord && !data.applicationRecord.documents?.some(doc => Number(doc.id) === docId)) return res.sendStatus(404);
    const [[doc]] = await pool.execute('SELECT * FROM user_admin_docs WHERE id = ? AND user_id = ?', [docId, submission.guardian_user_id]);
    if (!doc?.storage_path) return res.sendStatus(404);
    if (!data?.applicationRecord) {
      const withinSubmission = Math.abs(new Date(doc.created_at).getTime() - new Date(submission.submitted_at).getTime()) <= 15 * 60 * 1000;
      if (!withinSubmission || !['resume', 'cover_letter', 'application_material'].includes(doc.doc_type)) return res.sendStatus(404);
    }
    const { resolveOwnedAdminDocStoragePath } = await import('../utils/candidateApplicationFile.js');
    const path = await resolveOwnedAdminDocStoragePath(doc, submission.guardian_user_id);
    const bytes = await StorageService.readObject(path);
    const name = String(doc.original_name || 'application-document').replace(/[\r\n"\\]/g, '_');
    const inline = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg'].includes(doc.mime_type);
    res.set({ 'Content-Type': doc.mime_type || 'application/octet-stream', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"`,
      'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.send(Buffer.from(bytes));
  } catch (error) { next(error); }
}
