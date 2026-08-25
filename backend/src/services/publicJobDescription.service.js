/**
 * Permanent public job description pages + email materials.
 * Accessible even when the posting is inactive or past its schedule window.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import config from '../config/config.js';
import Agency from '../models/Agency.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import StorageService from './storage.service.js';
import {
  parseJobDescriptionSections,
  jobDescriptionSectionsHaveContent
} from '../utils/jobDescriptionSectionsSanitize.js';
import {
  dedicatedAppHostForSlug,
  hostnameFromCustomDomain,
  platformFrontendBase
} from '../utils/publicPortalUrl.js';

function hexToRgb(hex, fallback = { r: 0.1, g: 0.55, b: 0.33 }) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function agencyBrandLabel(agency) {
  const name = String(agency?.name || '').trim();
  const official = String(agency?.official_name || '').trim();
  if (name && name.length <= 32) return name;
  if (official && official.length <= 32) return official;
  return String(agency?.slug || name || official || 'Agency').trim() || 'Agency';
}

export function peopleOperationsFromDisplayName(agency) {
  return `${agencyBrandLabel(agency)}-People Operations`;
}

/**
 * Stable public URL for a job description page (works when closed / inactive).
 * Dedicated hosts: /careers/jobs/:jobId
 * Platform: /careers/:agencySlug/jobs/:jobId
 */
export function buildPublicJobDescriptionUrl(agency, jobId) {
  const jid = Number(jobId);
  if (!jid) return '';
  const slug = String(agency?.slug || agency?.portal_url || '').trim().toLowerCase();
  const dedicated =
    dedicatedAppHostForSlug(slug)
    || hostnameFromCustomDomain(agency?.custom_domain || agency?.customDomain);
  if (dedicated) {
    return `https://${dedicated}/careers/jobs/${jid}`;
  }
  const base = String(config.frontendUrl || platformFrontendBase() || '').replace(/\/$/, '');
  if (!slug) return `${base}/careers/jobs/${jid}`;
  return `${base}/careers/${encodeURIComponent(slug)}/jobs/${jid}`;
}

function isJobCurrentlyOpen(job) {
  if (!job) return false;
  if (Number(job.is_active) !== 1 && job.is_active !== true) return false;
  const now = Date.now();
  if (job.publish_at) {
    const t = new Date(job.publish_at).getTime();
    if (Number.isFinite(t) && t > now) return false;
  }
  if (job.unpublish_at) {
    const t = new Date(job.unpublish_at).getTime();
    if (Number.isFinite(t) && t <= now) return false;
  }
  return true;
}

function parseCareersAccent(agency) {
  try {
    const raw = agency?.careers_page_json;
    const page = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    const accent = String(page?.accentColor || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(accent)) return accent;
  } catch {
    /* ignore */
  }
  return '#1a8c54';
}

/**
 * Load permanent public job description payload (no apply CTA required).
 */
export async function getPublicJobDescriptionPayload({ agencySlug = null, jobId }) {
  const jid = Number(jobId);
  if (!jid) {
    const err = new Error('jobId is required');
    err.status = 400;
    throw err;
  }

  const job = await HiringJobDescription.findById(jid);
  if (!job?.id) {
    const err = new Error('Job description not found');
    err.status = 404;
    throw err;
  }

  const agency = await Agency.findById(job.agency_id);
  if (!agency?.id) {
    const err = new Error('Agency not found');
    err.status = 404;
    throw err;
  }

  const slug = String(agency.slug || '').trim().toLowerCase();
  const requested = String(agencySlug || '').trim().toLowerCase();
  if (requested && slug && requested !== slug) {
    const err = new Error('Job description not found for this agency');
    err.status = 404;
    throw err;
  }

  const sections = parseJobDescriptionSections(job.description_sections_json);
  const open = isJobCurrentlyOpen(job);
  const location = [job.city, job.state].map((s) => String(s || '').trim()).filter(Boolean).join(', ') || null;
  let pdfFileUrl = null;
  const storagePath = String(job.storage_path || '').trim();
  // Only expose uploaded PDF when structured sections are missing (legacy fallback).
  if (!sections && storagePath) {
    try {
      pdfFileUrl = await StorageService.getSignedUrl(storagePath, 60);
    } catch {
      pdfFileUrl = null;
    }
  }

  return {
    agency: {
      id: agency.id,
      slug: agency.slug || null,
      name: agency.name || null,
      officialName: agency.official_name || null,
      logoUrl: agency.logo_url || null,
      accentColor: parseCareersAccent(agency)
    },
    job: {
      jobId: Number(job.id),
      title: String(job.title || '').trim() || 'Job description',
      descriptionText: String(job.description_text || '').trim() || null,
      descriptionSections: sections,
      roleType: String(job.role_type || '').trim() || null,
      city: String(job.city || '').trim() || null,
      state: String(job.state || '').trim() || null,
      location,
      educationLevel: String(job.education_level || '').trim() || null,
      postedDate: job.posted_date || null,
      applicationDeadline: job.application_deadline || null,
      isOpen: open,
      statusLabel: open ? 'Open' : 'Currently closed',
      statusMessage: open
        ? null
        : 'This position is currently closed. This page is kept available as a permanent record of the job description.',
      jobDescriptionFileUrl: pdfFileUrl,
      jobDescriptionFileName: String(job.original_name || '').trim() || null,
      publicUrl: buildPublicJobDescriptionUrl(agency, job.id)
    }
  };
}

async function buildBrandedJobDescriptionPdfBuffer({ agency, job, sections }) {
  const title = String(job?.title || 'Job description').trim() || 'Job description';
  const agencyName = agencyBrandLabel(agency);
  const accent = hexToRgb(parseCareersAccent(agency));
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [612, 792];
  const margin = 48;
  const maxWidth = pageSize[0] - margin * 2;
  let page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;

  const wrap = (text, activeFont, size) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (activeFont.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const ensureSpace = (needed) => {
    if (y - needed >= margin) return;
    page = pdfDoc.addPage(pageSize);
    y = pageSize[1] - margin;
  };

  const drawLines = (lines, { size = 11, bold = false, color = rgb(0.12, 0.14, 0.18), gap = 4 } = {}) => {
    const active = bold ? fontBold : font;
    for (const line of lines) {
      ensureSpace(size + gap + 2);
      page.drawText(line, { x: margin, y: y - size, size, font: active, color });
      y -= size + gap;
    }
  };

  // Brand header bar
  page.drawRectangle({
    x: 0,
    y: pageSize[1] - 56,
    width: pageSize[0],
    height: 56,
    color: rgb(accent.r, accent.g, accent.b)
  });
  page.drawText(agencyName, {
    x: margin,
    y: pageSize[1] - 36,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1)
  });
  y = pageSize[1] - 80;

  drawLines(wrap(title, fontBold, 18), { size: 18, bold: true, gap: 6 });
  y -= 6;

  const meta = [
    job?.role_type ? `Role type: ${job.role_type}` : '',
    [job?.city, job?.state].filter(Boolean).join(', ') ? `Location: ${[job.city, job.state].filter(Boolean).join(', ')}` : '',
    job?.education_level ? `Education: ${job.education_level}` : ''
  ].filter(Boolean);
  if (meta.length) {
    drawLines(meta.flatMap((m) => wrap(m, font, 10)), { size: 10, color: rgb(0.35, 0.4, 0.45), gap: 3 });
    y -= 8;
  }

  const pushSection = (heading, bodyLines) => {
    if (!bodyLines?.length) return;
    y -= 6;
    drawLines([heading], { size: 13, bold: true, color: rgb(accent.r, accent.g, accent.b), gap: 5 });
    drawLines(bodyLines, { size: 11, gap: 4 });
  };

  if (sections?.aboutTheRole) {
    pushSection('About the Role', wrap(sections.aboutTheRole, font, 11));
  }
  for (const [heading, items] of [
    ['Responsibilities', sections?.responsibilities],
    ['Qualifications', sections?.qualifications],
    ['Benefits', sections?.benefits]
  ]) {
    if (!Array.isArray(items) || !items.length) continue;
    const lines = items.flatMap((item) => wrap(`• ${item}`, font, 11));
    pushSection(heading, lines);
  }

  const plain = String(job?.description_text || '').trim();
  if (!sections && plain) {
    pushSection('Description', wrap(plain, font, 11));
  }

  ensureSpace(24);
  page.drawText('Official job description — for your records.', {
    x: margin,
    y: margin - 8,
    size: 8,
    font,
    color: rgb(0.5, 0.52, 0.55)
  });

  return Buffer.from(await pdfDoc.save());
}

/**
 * Prefer structured sections → branded PDF; then description_text; uploaded PDF only as last resort.
 */
export async function buildJobDescriptionAttachmentForEmail(jobDescription, { agency = null } = {}) {
  if (!jobDescription) return null;
  const title = String(jobDescription.title || 'Job description').trim() || 'Job description';
  const safeName = `${title.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'job'}-description.pdf`;
  const sections = parseJobDescriptionSections(jobDescription.description_sections_json);
  const plain = String(jobDescription.description_text || '').trim();

  if (jobDescriptionSectionsHaveContent(sections) || plain) {
    let agencyRow = agency;
    if (!agencyRow && jobDescription.agency_id) {
      agencyRow = await Agency.findById(jobDescription.agency_id).catch(() => null);
    }
    try {
      const buf = await buildBrandedJobDescriptionPdfBuffer({
        agency: agencyRow || {},
        job: jobDescription,
        sections
      });
      return {
        filename: safeName,
        contentType: 'application/pdf',
        contentBase64: buf.toString('base64')
      };
    } catch (e) {
      console.warn('[buildJobDescriptionAttachmentForEmail] branded PDF failed', e?.message || e);
    }
  }

  const path = String(jobDescription.storage_path || '').trim();
  if (path) {
    try {
      const buf = await StorageService.readObject(path);
      const orig = String(jobDescription.original_name || 'job-description.pdf').trim() || 'job-description.pdf';
      const mime = String(jobDescription.mime_type || 'application/pdf').trim() || 'application/pdf';
      return {
        filename: orig,
        contentType: mime,
        contentBase64: Buffer.from(buf).toString('base64')
      };
    } catch {
      // fall through
    }
  }

  if (plain) {
    return {
      filename: `${title.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'job'}-description.txt`,
      contentType: 'text/plain; charset=utf-8',
      contentBase64: Buffer.from(plain.slice(0, 12000), 'utf8').toString('base64')
    };
  }
  return null;
}
