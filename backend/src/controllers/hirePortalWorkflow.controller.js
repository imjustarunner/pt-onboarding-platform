import { validateClinicalProfile } from '../utils/hireClinicalProfile.js';
import { randomUUID } from 'node:crypto';
import { portalStateForUser, getPortalTask, viewPortalSignedFile } from './prehirePortal.controller.js';
import { savePortalStep, portalStepSubmissions, validatePreemployment } from '../services/hirePortalWorkflow.service.js';
import { safePortalUrl } from '../utils/hirePortalWorkflow.js';
import StorageService from '../services/storage.service.js';
import { buildSignedReceipt } from '../services/prehireSignedReceipt.service.js';
import DocumentSigningService from '../services/documentSigning.service.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
async function context(req) {
  const state = await portalStateForUser(req.portalUser.id);
  const phase = state.candidate.status === 'ONBOARDING' ? 'onboarding' : 'pre_hire';
  const key = String(req.params.stepKey || '');
  const step = state.workflow.steps[phase].find((s) => s.key === key);
  return { state, phase, key, step, userId: req.portalUser.id, agencyId: state.agency.id };
}
export async function saveWorkflowStep(req, res, next) {
  try {
    const ctx = await context(req);
    let value, file;
    if (ctx.phase === 'pre_hire' && ctx.key === 'profile') {
      value = validatePreemployment(req.body?.values, req.body?.complete !== false);
    } else if (ctx.phase === 'onboarding' && ctx.step?.kind === 'clinical-profile') {
      if (req.body?.complete !== false && req.body?.reviewed !== true) fail('Confirm that you have reviewed all four sections.');
      value = { values: validateClinicalProfile(req.body?.values, ctx.step.fields), reviewed: req.body?.reviewed === true };
    } else if (ctx.phase === 'pre_hire' && ctx.key === 'work-email') {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter your preferred work email.');
      if (ctx.state.hireAccountMode === 'group_password') fail('Select an available username using account setup.');
      value = { email, preferenceOnly: true };
    } else {
      if (!ctx.step || !['handbook', 'link', 'video', 'meeting', 'acknowledgement'].includes(ctx.step.kind)) fail('This item is completed by its form, upload or signature.', 403);
      if (!safePortalUrl(ctx.step.url)) fail('People Operations needs to attach this resource before it can be completed.');
      if (req.body?.acknowledged !== true) fail('Confirm that you have completed this step.');
      value = { title: ctx.step.title, url: ctx.step.url, acknowledged: true };
      if (ctx.step.kind === 'meeting') {
        const when = new Date(req.body?.scheduledAt);
        if (!Number.isFinite(when.getTime())) fail('Enter the date and time confirmed by the meeting scheduler.');
        value.scheduledAt = when.toISOString();
        value.confirmation = String(req.body?.confirmation || '').slice(0, 1000);
      }
      if (ctx.step.kind === 'acknowledgement' || (ctx.step.kind === 'handbook' && ctx.phase === 'onboarding')) {
        const signerName = ctx.state.workflow.profile?.full_legal_name || `${ctx.state.candidate.firstName} ${ctx.state.candidate.lastName}`;
        const pdf = await buildSignedReceipt({ title: `${ctx.state.agency.name} · ${ctx.step.title}`, body: `I acknowledge that I reviewed ${ctx.step.title}.\nResource: ${ctx.step.url}\n${ctx.step.instructions || ''}`, signerName, signatureData: req.body?.signatureData });
        const name = `acknowledgement-${randomUUID()}.pdf`;
        const saved = await StorageService.saveAdminDoc(pdf, name, 'application/pdf');
        file = { title: ctx.step.title, path: saved.relativePath, name, mime: 'application/pdf', docType: 'hire_portal_acknowledgement' };
        value.receiptPath = saved.relativePath;
      }
    }
    await savePortalStep({ ...ctx, value, file, complete: req.body?.complete !== false, profile: ctx.key === 'profile' });
    if (ctx.step?.kind === 'clinical-profile' && req.body?.complete !== false) {
      setImmediate(async () => {
        try {
          const { default: ProviderSearchIndex } = await import('../models/ProviderSearchIndex.model.js');
          await ProviderSearchIndex.upsertForUserInAgency({ userId: ctx.userId, agencyId: ctx.agencyId });
        } catch { /* Saved profile answers remain authoritative if indexing is unavailable. */ }
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function uploadWorkflowFile(req, res, next) {
  try {
    const ctx = await context(req);
    const isProfile = ctx.phase === 'pre_hire' && ['headshot', 'resume'].includes(ctx.key);
    if (!isProfile && ctx.step?.kind !== 'upload') fail('Upload is not part of this step.', 403);
    if (!req.file || req.file.size > 10 * 1024 * 1024) fail('Choose one file up to 10 MB.');
    const mime = req.file.mimetype;
    const types = ctx.key === 'headshot' ? ['image/jpeg', 'image/png', 'image/webp'] : ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!types.includes(mime)) fail('Choose a supported image, PDF or Word file.');
    // Decode headshots to exclude active content and invalid image uploads.
    let bytes = req.file.buffer;
    let ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'application/msword' ? 'doc' : 'docx';
    if (ctx.key === 'headshot') {
      const sharp = (await import('sharp')).default;
      bytes = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
      ext = 'jpg';
    }
    const name = `hire-${ctx.key}-${randomUUID()}.${ext}`;
    // Keep the package copy independent of the editable employee photo album.
    const saved = await StorageService.saveAdminDoc(bytes, name, ctx.key === 'headshot' ? 'image/jpeg' : mime);
    const profilePhoto = ctx.key === 'headshot' ? await StorageService.saveUserProfilePhoto(ctx.userId, bytes, name, 'image/jpeg') : null;
    const file = { title: ctx.key === 'headshot' ? 'Professional headshot' : ctx.key === 'resume' ? 'Resume / work history' : ctx.step.title,
      path: saved.relativePath, profilePath: profilePhoto?.relativePath, name, mime: ctx.key === 'headshot' ? 'image/jpeg' : mime };
    await savePortalStep({ ...ctx, value: { name: req.file.originalname, path: file.path, mime: file.mime }, file });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
}
export async function viewWorkflowFile(req, res, next) {
  try {
    const phase = req.params.phase;
    if (!['pre_hire', 'onboarding'].includes(phase)) fail('File not found.', 404);
    const submissions = await portalStepSubmissions(req.portalUser.id);
    const value = submissions[`${phase}:${req.params.stepKey}`]?.value;
    if (!value?.path && !value?.receiptPath) fail('File not found.', 404);
    res.set({ 'Content-Type': value.mime || 'application/pdf', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" });
    res.send(await StorageService.readObject(value.path || value.receiptPath));
  } catch (e) { next(e); }
}

export async function previewPortalDocument(req, res, next) {
  try {
    let detail;
    await getPortalTask(req, { json: (data) => { detail = data; }, status: () => ({ json: () => fail('Document not found.', 404) }) }, (e) => { throw e; });
    if (!detail?.document || detail.taskType !== 'document') fail('Document not found.', 404);
    if (detail.status === 'completed' && detail.signedFileUrl) return viewPortalSignedFile(req, res, next);
    let bytes;
    if (detail.document.templateType === 'pdf' && detail.document.filePath) bytes = await StorageService.readObject(detail.document.filePath);
    else if (detail.document.htmlContent) {
      const state = await portalStateForUser(req.portalUser.id);
      const branded = await DocumentSigningService.applyPacketBrandChromeToHtml(detail.document.htmlContent, { agencyId: state.agency.id });
      bytes = await DocumentSigningService.convertHTMLToPDF(branded.html, { ...branded.pdfOptions, disableFallback: true });
    } else fail('People Operations needs to attach the document before you can review it.');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="employment-document.pdf"', 'Cache-Control': 'no-store' });
    res.send(Buffer.from(bytes));
  } catch (e) { next(e); }
}
