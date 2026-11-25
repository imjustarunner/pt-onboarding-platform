import pool from '../config/database.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import DocumentSigningService from '../services/documentSigning.service.js';
import StorageService from '../services/storage.service.js';
import { previewAgency } from './hirePacketPreview.controller.js';
import { mergePrehireDocuments } from '../utils/prehireConfigSanitize.js';
import { jsonObject } from '../utils/hirePortalWorkflow.js';
import { renderPrehireAuthoredDocument } from '../services/prehireAuthoredDocument.service.js';

// Hiring managers preview stored sources without a candidate session, assignment,
// signature, or caller-supplied HTML/storage path. The router capability-gates it.
export async function previewHireDocument(req, res, next) {
  try {
    const agencyId = await previewAgency(req);
    let doc;
    if (req.query.documentId) {
      const [[agency]] = await pool.execute('SELECT prehire_settings FROM agencies WHERE id = ?', [agencyId]);
      const [[job]] = await pool.execute('SELECT prehire_config_json FROM hiring_job_descriptions WHERE id = ? AND agency_id = ?', [Number(req.query.jobId) || 0, agencyId]);
      if (!job) throw Object.assign(new Error('Job posting not found in this agency.'), { status: 404 });
      doc = mergePrehireDocuments(jsonObject(job.prehire_config_json), { documents: jsonObject(agency?.prehire_settings).default_prehire_docs || [] }).documents.find(d => d.id === req.query.documentId);
      if (!doc) throw Object.assign(new Error('Document not found for this job.'), { status: 404 });
    }
    const templateId = doc?.templateId || Number(req.query.templateId);
    let buffer, mime = 'application/pdf';
    if (templateId) {
      const template = await DocumentTemplate.findById(templateId);
      // Platform templates are also used by hiring; organization-scoped ones
      // require affiliation, so this endpoint intentionally accepts agency only.
      if (!template || (template.agency_id != null && Number(template.agency_id) !== agencyId) || template.organization_id) throw Object.assign(new Error('Document not available in this agency.'), { status: 404 });
      if (template.template_type === 'pdf' && template.file_path) {
        buffer = await StorageService.readTemplate(String(template.file_path).split('/').pop());
      } else if (template.html_content) {
        const branded = await DocumentSigningService.applyPacketBrandChromeToHtml(template.html_content, { agencyId });
        buffer = Buffer.from(await DocumentSigningService.convertHTMLToPDF(branded.html, { ...branded.pdfOptions, disableFallback: true }));
      } else throw Object.assign(new Error('This template has no previewable content.'), { status: 409 });
    } else if (doc?.bodyHtml) buffer = await renderPrehireAuthoredDocument(doc, agencyId);
    else if (doc?.filePath) { buffer = await StorageService.readObject(doc.filePath); mime = doc.mimeType || mime; }
    else throw Object.assign(new Error('Attach a file or write this document before it can be previewed.'), { status: 409 });
    const safeInline = mime === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
    res.set({ 'Content-Type': mime, 'Content-Disposition': safeInline ? 'inline' : 'attachment', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" }).send(buffer);
  } catch (error) { next(error); }
}
