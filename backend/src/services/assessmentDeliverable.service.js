import HTMLtoDOCX from 'html-to-docx';
import pool from '../config/database.js';
import ClientAssessmentDeliverable from '../models/ClientAssessmentDeliverable.model.js';
import DocumentSigningService from './documentSigning.service.js';
import { GoogleDriveService } from './googleDrive.service.js';
import {
  ASSESSMENT_FAMILIES,
  getFamilyMeta,
  normalizeFamilyKey
} from './assessmentFamilyRegistry.js';
import {
  buildScoresSnapshot,
  plainSummaryFromHtml,
  renderPlanHtml,
  renderResultHtml
} from './assessmentDeliverableRender.service.js';

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function loadAgencyBranding(agencyId) {
  if (!agencyId) return { orgName: null, logoUrl: null };
  const [rows] = await pool.execute(
    `SELECT a.id, a.name, a.logo_url, a.slug
     FROM agencies a WHERE a.id = ? LIMIT 1`,
    [Number(agencyId)]
  );
  const a = rows?.[0];
  if (!a) return { orgName: null, logoUrl: null };
  return {
    orgName: a.name || null,
    logoUrl: a.logo_url || null,
    slug: a.slug || null
  };
}

async function assertClientInAgency({ clientId, agencyId }) {
  const [rows] = await pool.execute(
    `SELECT id, agency_id, first_name, last_name, full_name
     FROM clients WHERE id = ? LIMIT 1`,
    [Number(clientId)]
  );
  const client = rows?.[0];
  if (!client) throw err(404, 'Client not found');
  if (agencyId != null && Number(client.agency_id) !== Number(agencyId)) {
    throw err(403, 'Client does not belong to this agency');
  }
  return client;
}

export async function assertCoachCanAccessClient({ user, clientId }) {
  if (!user) throw err(401, 'Authentication required');
  const role = String(user.role || user.accountType || '').toLowerCase();
  const isSuper = role === 'super_admin';
  const agencyId = user.agencyId || user.agency_id || null;

  const client = await assertClientInAgency({
    clientId,
    agencyId: isSuper ? null : agencyId
  });

  if (!isSuper) {
    const userAgencies = Array.isArray(user.agencyIds)
      ? user.agencyIds.map(Number)
      : agencyId
        ? [Number(agencyId)]
        : [];
    if (userAgencies.length && !userAgencies.includes(Number(client.agency_id))) {
      throw err(403, 'Not authorized for this client');
    }
  }
  return client;
}

export async function assertClientCanViewOwnShared({ user, clientId }) {
  if (!user) throw err(401, 'Authentication required');
  const [rows] = await pool.execute(
    `SELECT id, user_id, agency_id FROM clients WHERE id = ? LIMIT 1`,
    [Number(clientId)]
  );
  const client = rows?.[0];
  if (!client) throw err(404, 'Client not found');
  const uid = Number(user.id);
  const linkedClientId =
    user.clientId || user.client_id || user.linkedClientId || null;
  const isOwner =
    (client.user_id != null && Number(client.user_id) === uid) ||
    (linkedClientId != null && Number(linkedClientId) === Number(clientId));
  const role = String(user.role || '').toLowerCase();
  const isStaff = [
    'super_admin',
    'admin',
    'support',
    'staff',
    'provider',
    'provider_plus',
    'supervisor',
    'life_coach',
    'consultant'
  ].includes(role);
  if (isOwner || isStaff) return client;

  const [links] = await pool.execute(
    `SELECT 1 AS ok FROM client_guardians
     WHERE client_id = ? AND guardian_user_id = ? AND access_enabled = 1
     LIMIT 1`,
    [Number(clientId), uid]
  );
  if (links?.length) return client;

  throw err(403, 'Not authorized');
}

/**
 * Generate (or refresh) result + plan deliverables when assessment has client_id.
 * Guest demos without client_id are skipped.
 */
export async function maybeGenerateClientDeliverables({
  family,
  assessment,
  createdByUserId = null
} = {}) {
  try {
    const familyKey = normalizeFamilyKey(family);
    if (!familyKey || !assessment) return null;

    const clientId = assessment.clientId ?? assessment.client_id ?? null;
    if (!clientId) return null;

    const agencyId = assessment.agencyId ?? assessment.agency_id ?? null;
    if (!agencyId) {
      console.warn('[deliverables] skip: missing agency_id', familyKey, assessment.id);
      return null;
    }

    const assessmentId = Number(assessment.id);
    if (!assessmentId) return null;

    const branding = await loadAgencyBranding(agencyId);
    const meta = getFamilyMeta(familyKey);
    const snapshot = buildScoresSnapshot(assessment);

    const resultHtml = renderResultHtml({ family: familyKey, assessment, branding });
    const planHtml = renderPlanHtml({ family: familyKey, assessment, branding });

    const result = await ClientAssessmentDeliverable.upsert({
      agencyId,
      clientId,
      assessmentFamily: familyKey,
      assessmentId,
      kind: 'result',
      title: `${meta.title} — Results`,
      htmlBody: resultHtml,
      plainSummary: plainSummaryFromHtml(resultHtml),
      scoresSnapshot: snapshot,
      createdByUserId
    });

    const plan = await ClientAssessmentDeliverable.upsert({
      agencyId,
      clientId,
      assessmentFamily: familyKey,
      assessmentId,
      kind: 'plan',
      title: `${meta.title} — Action Plan`,
      htmlBody: planHtml,
      plainSummary: plainSummaryFromHtml(planHtml),
      scoresSnapshot: snapshot,
      createdByUserId
    });

    return { result, plan };
  } catch (e) {
    console.error('[deliverables] generate failed', e?.message || e);
    return null;
  }
}

/** Fire-and-forget wrapper for completeAssessment hooks */
export function scheduleDeliverableGeneration(args) {
  setImmediate(() => {
    maybeGenerateClientDeliverables(args).catch((e) =>
      console.error('[deliverables] async generate failed', e?.message || e)
    );
  });
}

export async function listForClient({ clientId, agencyId = null }) {
  return ClientAssessmentDeliverable.listForClient({ clientId, agencyId });
}

export async function listSharedForClient({ clientId }) {
  return ClientAssessmentDeliverable.listForClient({ clientId, sharedOnly: true });
}

export async function getById(id) {
  return ClientAssessmentDeliverable.findById(id);
}

export async function updateDeliverable({ id, title, htmlBody, plainSummary }) {
  return ClientAssessmentDeliverable.updateBody({ id, title, htmlBody, plainSummary });
}

export async function shareDeliverable({ id, userId }) {
  return ClientAssessmentDeliverable.setShared({ id, shared: true, userId });
}

export async function unshareDeliverable({ id }) {
  return ClientAssessmentDeliverable.setShared({ id, shared: false });
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function htmlToDocxBuffer(html, title) {
  const buf = await HTMLtoDOCX(html, null, {
    title: title || 'Assessment Deliverable',
    margins: { top: 720, right: 720, bottom: 720, left: 720 }
  });
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

export async function exportDeliverable({
  id,
  format,
  subjectEmail = null
} = {}) {
  const doc = await ClientAssessmentDeliverable.findById(id);
  if (!doc) throw err(404, 'Deliverable not found');

  const fmt = String(format || '').toLowerCase();
  const safeName = String(doc.title || 'deliverable')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 80);

  if (fmt === 'txt') {
    const text = stripHtmlToText(doc.htmlBody);
    return {
      doc,
      filename: `${safeName}.txt`,
      mimeType: 'text/plain; charset=utf-8',
      buffer: Buffer.from(text, 'utf8'),
      meta: null
    };
  }

  if (fmt === 'pdf') {
    const pdf = await DocumentSigningService.convertHTMLToPDF(doc.htmlBody, {});
    return {
      doc,
      filename: `${safeName}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdf),
      meta: null
    };
  }

  if (fmt === 'docx') {
    const buffer = await htmlToDocxBuffer(doc.htmlBody, doc.title);
    return {
      doc,
      filename: `${safeName}.docx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
      meta: null
    };
  }

  if (fmt === 'google_doc' || fmt === 'google_docs') {
    const buffer = await htmlToDocxBuffer(doc.htmlBody, doc.title);
    const subject =
      String(subjectEmail || '').trim() ||
      process.env.GOOGLE_WORKSPACE_DRIVE_IMPERSONATE_USER ||
      process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER ||
      '';
    const folderId =
      process.env.ASSESSMENT_DELIVERABLES_DRIVE_FOLDER_ID ||
      process.env.GOOGLE_WORKSPACE_DRIVE_FOLDER_ID ||
      '';
    if (!subject) {
      throw err(
        400,
        'Google Doc export requires coach email or GOOGLE_WORKSPACE_DRIVE_IMPERSONATE_USER / GOOGLE_WORKSPACE_IMPERSONATE_USER'
      );
    }
    if (!folderId) {
      throw err(
        400,
        'Google Doc export requires ASSESSMENT_DELIVERABLES_DRIVE_FOLDER_ID (or GOOGLE_WORKSPACE_DRIVE_FOLDER_ID)'
      );
    }
    const uploaded = await GoogleDriveService.uploadBufferAsGoogleDoc({
      subjectEmail: subject,
      folderId,
      filename: `${doc.title || safeName}.docx`,
      buffer
    });
    const updated = await ClientAssessmentDeliverable.setGoogleDoc({
      id: doc.id,
      googleDocId: uploaded.id,
      googleDocUrl: uploaded.webViewLink
    });
    return {
      doc: updated,
      filename: null,
      mimeType: null,
      buffer: null,
      meta: {
        googleDocId: uploaded.id,
        googleDocUrl: uploaded.webViewLink
      }
    };
  }

  throw err(400, `Unsupported export format: ${format}`);
}

export async function replaceDeliverable({
  id,
  htmlBody = undefined,
  title = undefined,
  fileBuffer = null,
  filename = null,
  mimeType = null,
  storagePath = null
} = {}) {
  const doc = await ClientAssessmentDeliverable.findById(id);
  if (!doc) throw err(404, 'Deliverable not found');

  if (htmlBody != null || title != null) {
    return ClientAssessmentDeliverable.updateBody({
      id,
      htmlBody,
      title,
      plainSummary: htmlBody != null ? plainSummaryFromHtml(htmlBody) : undefined
    });
  }

  if (fileBuffer && Buffer.isBuffer(fileBuffer)) {
    // Store path reference if provided by caller; otherwise keep mime + bump version with note in summary
    const path =
      storagePath ||
      `assessment-deliverables/${doc.clientId}/${doc.id}/v${doc.version + 1}-${filename || 'replace.bin'}`;
    return ClientAssessmentDeliverable.setStorageReplace({
      id,
      storagePath: path,
      storageMime: mimeType || 'application/octet-stream',
      title
    });
  }

  throw err(400, 'Provide htmlBody or a file to replace');
}

/**
 * List assessment rows across families for a client (for profile tab).
 */
export async function listClientAssessments({ clientId, agencyId = null }) {
  const out = [];
  for (const meta of ASSESSMENT_FAMILIES) {
    try {
      if (meta.kind === 'couples') {
        const clauses = ['client_id = ?'];
        const params = [Number(clientId)];
        if (agencyId != null) {
          clauses.push('agency_id = ?');
          params.push(Number(agencyId));
        }
        const [rows] = await pool.execute(
          `SELECT id, status, agency_id, client_id, completed_at, created_at, updated_at
           FROM ${meta.table}
           WHERE ${clauses.join(' AND ')}
           ORDER BY id DESC
           LIMIT 50`,
          params
        );
        for (const r of rows || []) {
          out.push({
            family: meta.family,
            catalogId: meta.catalogId,
            title: meta.title,
            kind: meta.kind,
            id: Number(r.id),
            status: r.status,
            agencyId: r.agency_id == null ? null : Number(r.agency_id),
            clientId: r.client_id == null ? null : Number(r.client_id),
            accessToken: null,
            completedAt: r.completed_at,
            createdAt: r.created_at,
            updatedAt: r.updated_at
          });
        }
      } else {
        const clauses = ['client_id = ?'];
        const params = [Number(clientId)];
        if (agencyId != null) {
          clauses.push('agency_id = ?');
          params.push(Number(agencyId));
        }
        const [rows] = await pool.execute(
          `SELECT id, status, agency_id, client_id, access_token, completed_at, created_at, updated_at
           FROM ${meta.table}
           WHERE ${clauses.join(' AND ')}
           ORDER BY id DESC
           LIMIT 50`,
          params
        );
        for (const r of rows || []) {
          out.push({
            family: meta.family,
            catalogId: meta.catalogId,
            title: meta.title,
            kind: meta.kind,
            id: Number(r.id),
            status: r.status,
            agencyId: r.agency_id == null ? null : Number(r.agency_id),
            clientId: r.client_id == null ? null : Number(r.client_id),
            accessToken: r.access_token || null,
            completedAt: r.completed_at,
            createdAt: r.created_at,
            updatedAt: r.updated_at
          });
        }
      }
    } catch (e) {
      // Table may not exist in older envs — skip
      console.warn(`[deliverables] list ${meta.family} failed:`, e?.message || e);
    }
  }
  out.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  return out;
}

export { getFamilyMeta, normalizeFamilyKey, ASSESSMENT_FAMILIES };
