import Agency from '../models/Agency.model.js';
import AgencySchoolIntakeMaster from '../models/AgencySchoolIntakeMaster.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import pool from '../config/database.js';
import {
  buildIntakeSummaryDocumentHtml,
  buildQuickIntakeSummarySpec,
  generateIntakeSummaryPdf,
  recordPdfFilename
} from '../services/intakeSummaryPdf.service.js';
import { buildCompletedIntakeRecord } from '../services/completedIntakeRecord.service.js';
import { brandedIntakeSummarySpec } from '../services/packetBrandChrome.service.js';
import { assertCanEditPublicAgencySupport } from '../services/publicAgencySupport.service.js';
import {
  getIntakeSummaryPdfEmailSettings,
  upsertIntakeSummaryPdfEmailSettings
} from '../services/intakeSummaryPdfEmail.service.js';

function sendPdf(res, buffer, filename) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(bytes.length));
  return res.send(bytes);
}

function pdfUnavailable(res, err) {
  const status = err?.statusCode || err?.status || (err?.code === 'PDF_RENDERER_UNAVAILABLE' ? 503 : 500);
  return res.status(status).json({
    error: { message: err?.message || 'Unable to create the branded PDF right now.' }
  });
}

async function resolvePublicAgency(slugOrId) {
  const slug = String(slugOrId || '').trim();
  if (!slug) return null;
  if (/^\d+$/.test(slug)) return Agency.findById(Number(slug));
  return (await Agency.findByPortalUrl(slug)) || (await Agency.findBySlug(slug));
}

function agencyDisplayName(agency) {
  return String(agency?.official_name || agency?.name || '').trim();
}

function agencyFileSlug(agency) {
  return String(agency?.portal_url || agency?.slug || 'intake').trim() || 'intake';
}

function initialsFromName(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 4);
}

async function resolveOfficeRecord(req) {
  const publicKey = String(req.params.publicKey || '').trim();
  const submissionId = Number(req.params.submissionId || 0);
  const sessionToken = String(req.body?.sessionToken || req.query?.sessionToken || '').trim();
  if (!publicKey || !submissionId || !sessionToken) {
    const err = new Error('sessionToken is required');
    err.statusCode = 400;
    throw err;
  }
  let link = await IntakeLink.findByPublicKey(publicKey);
  if (!link) {
    const err = new Error('Intake link not found');
    err.statusCode = 404;
    throw err;
  }
  const submission = await IntakeSubmission.findBySessionToken(sessionToken);
  if (!submission || Number(submission.id) !== submissionId) {
    const err = new Error('Submission not found');
    err.statusCode = 404;
    throw err;
  }
  if (Number(submission.intake_link_id) !== Number(link.id)) {
    const err = new Error('Submission not found');
    err.statusCode = 404;
    throw err;
  }
  const agency = await Agency.findById(link.organization_id);
  try {
    link = await AgencyOfficeIntakeMaster.applyMasterToLink(link, { agencyId: agency?.id || link.organization_id });
  } catch (inheritErr) {
    console.warn('[intakeSummaryPdf] office master overlay failed', inheritErr?.message || inheritErr);
  }
  try {
    link = await AgencySchoolIntakeMaster.applyMasterToLink(link, {
      agencyId: agency?.id || link.organization_id,
      languageCode: link.language_code || submission.language_code || 'en'
    });
  } catch (inheritErr) {
    console.warn('[intakeSummaryPdf] school master overlay failed', inheritErr?.message || inheritErr);
  }
  const signedDocuments = await IntakeSubmissionDocument.listSignedForRecord(submission.id);
  const packetKind = String(link?.scope_type || '').toLowerCase() === 'school' ? 'school' : 'office';
  const spec = await brandedIntakeSummarySpec(buildCompletedIntakeRecord({
    agency,
    link,
    submission,
    signedDocuments,
    guardian: req.body?.guardian || {},
    clients: Array.isArray(req.body?.clients) ? req.body.clients : [],
    publicKey,
    brandLogoUrl: String(agency?.logo_url || '').trim(),
    publicOrigin: String(req.get('origin') || process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')
  }), agency, {
    packetKind,
    link,
    masterChannel: link?.master_channel,
    title: link?.title,
    formType: link?.form_type || submission?.form_type
  });
  return { agency, spec, submission };
}

function summaryPdfFilename(agency, body = {}) {
  const initials = String(body.initials || '').trim() || initialsFromName(body.clientName);
  return recordPdfFilename({
    tenant: agencyDisplayName(agency) || agencyFileSlug(agency),
    initials,
    dateOfBirth: body.dateOfBirth,
    fallback: `${agencyFileSlug(agency)}-intake-summary.pdf`
  });
}

/** POST /api/public-intake/:publicKey/:submissionId/summary-pdf */
export async function downloadPublicIntakeSummaryPdf(req, res, next) {
  try {
    const { agency, spec } = await resolveOfficeRecord(req);
    const pdf = await generateIntakeSummaryPdf(spec);
    return sendPdf(
      res,
      pdf,
      summaryPdfFilename(agency, {
        initials: req.body?.initials,
        dateOfBirth: req.body?.dateOfBirth || req.body?.clients?.[0]?.dateOfBirth,
        clientName: req.body?.clientName
          || req.body?.clients?.[0]?.fullName
          || [req.body?.clients?.[0]?.firstName, req.body?.clients?.[0]?.lastName].filter(Boolean).join(' ')
      })
    );
  } catch (err) {
    if (err?.code === 'PDF_RENDERER_UNAVAILABLE' || err?.statusCode) {
      return pdfUnavailable(res, err);
    }
    next(err);
  }
}

/** GET /api/public-intake/:publicKey/:submissionId/summary — branded HTML, no PDF wait */
export async function viewPublicIntakeSummaryHtml(req, res, next) {
  try {
    const { spec } = await resolveOfficeRecord(req);
    const html = buildIntakeSummaryDocumentHtml({ ...spec, printable: true });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(html);
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ error: { message: err.message } });
    }
    next(err);
  }
}

/** POST /api/public/adaptive-intake/:agencySlug/summary-pdf */
export async function downloadQuickIntakeSummaryPdf(req, res, next) {
  try {
    const agency = await resolvePublicAgency(req.params.agencySlug);
    if (!agency || Number(agency.is_active) === 0) {
      return res.status(404).json({ error: { message: 'Organization not found' } });
    }

    const clientId = Number(req.body?.clientId || 0) || null;
    const identifierCode = String(req.body?.identifierCode || '').trim();
    let storedSummary = null;
    let storedSubmittedAt = null;

    if (clientId) {
      try {
        const [rows] = await pool.execute(
          `SELECT id, identifier_code, adaptive_intake_meta_json, intake_preferences_json
             FROM clients
            WHERE id = ? AND agency_id = ?
            LIMIT 1`,
          [clientId, agency.id]
        );
        const row = rows?.[0];
        if (!row) {
          return res.status(404).json({ error: { message: 'Confirmation not found' } });
        }
        if (identifierCode && row.identifier_code && String(row.identifier_code) !== identifierCode) {
          return res.status(404).json({ error: { message: 'Confirmation not found' } });
        }
        const meta = typeof row.adaptive_intake_meta_json === 'string'
          ? (() => { try { return JSON.parse(row.adaptive_intake_meta_json); } catch { return {}; } })()
          : (row.adaptive_intake_meta_json || {});
        storedSubmittedAt = meta?.submittedAt || null;
        storedSummary = {
          whoFor: meta?.whoFor || null,
          whoForLabel: req.body?.summary?.whoForLabel || null,
          contactName: [meta?.respondent?.firstName, meta?.respondent?.lastName].filter(Boolean).join(' ').trim() || null,
          contactEmail: meta?.respondent?.email || null,
          contactPhone: meta?.respondent?.phone || null,
          clientName: null,
          birthdate: meta?.birthdate || null,
          homeAddress: meta?.homeAddress || null,
          concerns: Array.isArray(meta?.concerns) ? meta.concerns : [],
          accomplishGoal: meta?.accomplishGoal || null,
          notes: meta?.notes || null,
          preferredModality: req.body?.summary?.preferredModality || null,
          preferredTimeOfDay: req.body?.summary?.preferredTimeOfDay || null,
          preferredDays: req.body?.summary?.preferredDays || [],
          insuranceOrPayment: req.body?.summary?.insuranceOrPayment || null,
          serviceType: req.body?.summary?.serviceType || null,
          preferredProvider: req.body?.summary?.preferredProvider || null,
          acknowledgments: req.body?.summary?.acknowledgments || []
        };
      } catch (lookupErr) {
        if (!/Unknown column|adaptive_intake_meta/i.test(String(lookupErr?.message || ''))) {
          throw lookupErr;
        }
      }
    }

    const posted = req.body?.summary && typeof req.body.summary === 'object' ? req.body.summary : {};
    const mergedSummary = { ...storedSummary, ...posted };
    const spec = await brandedIntakeSummarySpec(buildQuickIntakeSummarySpec({
      agencyName: agencyDisplayName(agency),
      identifierCode: identifierCode || req.body?.identifierCode || '',
      submittedAt: req.body?.submittedAt || storedSubmittedAt || new Date().toISOString(),
      summary: mergedSummary
    }), agency, {
      packetKind: 'intake',
      title: mergedSummary?.serviceType || mergedSummary?.preferredModality || '',
      formType: mergedSummary?.serviceType || ''
    });
    const pdf = await generateIntakeSummaryPdf(spec);
    return sendPdf(
      res,
      pdf,
      summaryPdfFilename(agency, {
        initials: req.body?.initials,
        dateOfBirth: req.body?.dateOfBirth || posted.birthdate || storedSummary?.birthdate,
        clientName: req.body?.clientName || posted.clientName || storedSummary?.clientName
      })
    );
  } catch (err) {
    if (err?.code === 'PDF_RENDERER_UNAVAILABLE' || err?.statusCode) {
      return pdfUnavailable(res, err);
    }
    next(err);
  }
}

async function buildOfficeSummaryPdf(req) {
  const { agency, spec, submission } = await resolveOfficeRecord(req);
  const pdf = await generateIntakeSummaryPdf(spec);
  const filename = summaryPdfFilename(agency, {
    initials: req.body?.initials,
    dateOfBirth: req.body?.dateOfBirth || req.body?.clients?.[0]?.dateOfBirth,
    clientName: req.body?.clientName
      || req.body?.clients?.[0]?.fullName
      || [req.body?.clients?.[0]?.firstName, req.body?.clients?.[0]?.lastName].filter(Boolean).join(' ')
  });
  return { agency, pdf, filename, clientId: submission.client_id };
}

/** POST /api/public-intake/:publicKey/:submissionId/summary-pdf/email */
export async function emailPublicIntakeSummaryPdf(req, res, next) {
  try {
    const { emailSummaryPdfCopy } = await import('../services/coGuardianInvite.service.js');
    const built = await buildOfficeSummaryPdf(req);
    await emailSummaryPdfCopy({
      to: req.body?.email,
      agency: built.agency,
      filename: built.filename,
      pdfBuffer: built.pdf,
      clientId: built.clientId
    });
    return res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'PDF_RENDERER_UNAVAILABLE' || err?.statusCode === 503) {
      return pdfUnavailable(res, err);
    }
    if (err?.status || err?.statusCode) {
      return res.status(err.status || err.statusCode).json({ error: { message: err.message } });
    }
    if (/valid email/i.test(String(err?.message || ''))) {
      return res.status(400).json({ error: { message: err.message } });
    }
    next(err);
  }
}

/** POST /api/public/adaptive-intake/:agencySlug/summary-pdf/email */
export async function emailQuickIntakeSummaryPdf(req, res, next) {
  try {
    const { emailSummaryPdfCopy } = await import('../services/coGuardianInvite.service.js');
    const agency = await resolvePublicAgency(req.params.agencySlug);
    if (!agency || Number(agency.is_active) === 0) {
      return res.status(404).json({ error: { message: 'Organization not found' } });
    }
    const clientId = Number(req.body?.clientId || 0) || null;
    const identifierCode = String(req.body?.identifierCode || '').trim();
    const posted = req.body?.summary && typeof req.body.summary === 'object' ? req.body.summary : {};
    const spec = await brandedIntakeSummarySpec(buildQuickIntakeSummarySpec({
      agencyName: agencyDisplayName(agency),
      identifierCode: identifierCode || '',
      submittedAt: req.body?.submittedAt || new Date().toISOString(),
      summary: posted
    }), agency, {
      packetKind: 'intake',
      title: posted?.serviceType || posted?.preferredModality || '',
      formType: posted?.serviceType || ''
    });
    const pdf = await generateIntakeSummaryPdf(spec);
    const filename = summaryPdfFilename(agency, {
      initials: req.body?.initials,
      dateOfBirth: req.body?.dateOfBirth || posted.birthdate,
      clientName: req.body?.clientName || posted.clientName
    });
    await emailSummaryPdfCopy({
      to: req.body?.email,
      agency,
      filename,
      pdfBuffer: pdf,
      clientId
    });
    return res.json({ ok: true });
  } catch (err) {
    if (err?.code === 'PDF_RENDERER_UNAVAILABLE' || err?.statusCode) {
      return pdfUnavailable(res, err);
    }
    if (/valid email/i.test(String(err?.message || ''))) {
      return res.status(400).json({ error: { message: err.message } });
    }
    next(err);
  }
}

async function resolveAgencyForPublicKey(publicKey) {
  const link = await IntakeLink.findByPublicKey(String(publicKey || '').trim());
  if (!link) {
    const err = new Error('Intake link not found');
    err.statusCode = 404;
    throw err;
  }
  const agency = await Agency.findById(link.organization_id);
  if (!agency) {
    const err = new Error('Organization not found');
    err.statusCode = 404;
    throw err;
  }
  return { link, agency };
}

/** GET /api/public-intake/:publicKey/summary-pdf/email-template */
export async function getPublicIntakeSummaryPdfEmailTemplate(req, res) {
  try {
    const { agency } = await resolveAgencyForPublicKey(req.params.publicKey);
    await assertCanEditPublicAgencySupport(req.user, agency.id);
    const settings = await getIntakeSummaryPdfEmailSettings(agency.id);
    return res.json({ ok: true, ...settings });
  } catch (err) {
    const status = err.status || err.statusCode || 500;
    return res.status(status).json({ error: { message: err.message || 'Unable to load email settings.' } });
  }
}

/** PUT /api/public-intake/:publicKey/summary-pdf/email-template */
export async function putPublicIntakeSummaryPdfEmailTemplate(req, res) {
  try {
    const { agency } = await resolveAgencyForPublicKey(req.params.publicKey);
    await assertCanEditPublicAgencySupport(req.user, agency.id);
    const settings = await upsertIntakeSummaryPdfEmailSettings({
      agencyId: agency.id,
      subject: req.body?.subject,
      body: req.body?.body,
      senderIdentityId: req.body?.senderIdentityId,
      actorUserId: req.user?.id || null
    });
    return res.json({ ok: true, ...settings });
  } catch (err) {
    const status = err.status || err.statusCode || 500;
    return res.status(status).json({ error: { message: err.message || 'Unable to save email settings.' } });
  }
}
