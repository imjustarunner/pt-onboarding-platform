import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import Agency from '../models/Agency.model.js';
import OfficePacketTemplate, {
  normalizeLocale,
  defaultHtmlForLocale,
  looksLikeSchoolSeedHtml
} from '../models/OfficePacketTemplate.model.js';
import {
  OFFICE_PRINTABLE_PACKET_VERSION,
  normalizeOfficePacketVariant,
  officePacketTitle
} from '../constants/officePrintablePacket.js';
import DocumentSigningService from './documentSigning.service.js';
import {
  listDisclosureProviders
} from './smartDisclosure.service.js';
import {
  buildSchoolStaffTableHtml,
  buildDisclosureCareTeamHtml,
  expandYourCareTeamProviders,
  buildPacketStyleBlock,
  buildPdfChromeTemplates
} from './schoolPrintablePacket.service.js';
import { defaultOfficePacketHtml } from '../content/officePacketTemplateDefault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRAND_DIR = path.join(__dirname, '../assets/schoolPrintablePacket/brand');
const BRAND_FALLBACK_ROOT = path.resolve(__dirname, '../../../assets/ITSCO Brand');
const COVER_PAGE_CANDIDATES = [
  path.join(BRAND_DIR, 'cover-page.png')
];


const COVER_PDF_MARGIN = { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' };
const BODY_PDF_MARGIN = { top: '0.75in', right: '0.5in', bottom: '0.5in', left: '0.5in' };

const _dataUrlCache = new Map();

function fileToDataUrl(filePath, mime) {
  if (_dataUrlCache.has(filePath)) return _dataUrlCache.get(filePath);
  const base64 = fs.readFileSync(filePath).toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;
  _dataUrlCache.set(filePath, dataUrl);
  return dataUrl;
}

function firstExistingDataUrl(candidates, mime) {
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return fileToDataUrl(filePath, mime);
  }
  return null;
}

function coverPageDataUrl() {
  return firstExistingDataUrl(COVER_PAGE_CANDIDATES, 'image/png');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildAgencyAddress(agency = {}) {
  const direct = String(agency?.street_address || '').trim();
  if (direct) return direct;
  const parts = [
    agency?.street_address,
    agency?.city,
    agency?.state,
    agency?.postal_code
  ].map((part) => String(part || '').trim()).filter(Boolean);
  return parts.join(', ') || '';
}

function substituteTokens(templateHtml, tokens = {}) {
  let html = String(templateHtml || '');
  for (const [key, value] of Object.entries(tokens)) {
    const token = `{{${key}}}`;
    html = html.split(token).join(String(value ?? ''));
  }
  return html;
}

function buildOfficeCoverPageHtml(variant = 'self', locale = 'en') {
  const cover = coverPageDataUrl();
  const title = `<h1 class="cover-page-title">${officePacketTitle(variant, locale)}</h1>`;
  if (!cover) {
    return `
      <section class="packet-cover packet-cover-fallback">
        ${title}
      </section>
    `;
  }
  return `
    <section class="packet-cover">
      <img class="cover-photo" src="${cover}" alt="${officePacketTitle(variant, locale)} cover" />
      ${title}
    </section>
  `;
}

function wrapPacketHtmlDocument(title, innerHtml) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
${buildPacketStyleBlock()}
    </style>
  </head>
  <body>
    ${innerHtml}
  </body>
</html>`;
}

export async function buildOfficePrintablePacketContext({ agencyId, locale = 'en', variant = 'self' } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) throw new Error('Invalid agencyId');
  const loc = normalizeLocale(locale);
  const pack = normalizeOfficePacketVariant(variant);

  const agency = await Agency.findById(aid);
  if (!agency) {
    const err = new Error('Agency not found');
    err.statusCode = 404;
    throw err;
  }

  const template = await OfficePacketTemplate.getOrCreateForAgency(aid, { locale: loc, variant: pack });
  const agencyName = String(agency.name || 'Agency').trim();
  const agencyAddress = buildAgencyAddress(agency);

  let providers = [];
  try {
    const raw = await listDisclosureProviders({ agencyId: aid });
    providers = await expandYourCareTeamProviders(raw, { agencyId: aid });
  } catch {
    providers = [];
  }

  return {
    version: Number(template?.version || 1),
    locale: loc,
    variant: pack,
    packetVersionLabel: OFFICE_PRINTABLE_PACKET_VERSION,
    generatedAt: new Date(),
    agencyId: aid,
    agency: {
      id: aid,
      name: agencyName,
      slug: String(agency.portal_url || agency.slug || '').trim(),
      address: agencyAddress
    },
    templateHtml: String(template?.html_content || defaultHtmlForLocale(loc, pack)),
    providers
  };
}

function buildOfficePacketBodyContentHtml(packetContext = {}) {
  const loc = packetContext?.locale || 'en';
  const agencyName = packetContext?.agency?.name || '';
  const agencyAddress = packetContext?.agency?.address || '';
  const staffTableHtml = buildSchoolStaffTableHtml([], loc);
  const disclosureHtml = buildDisclosureCareTeamHtml(packetContext?.providers || [], loc);

  const bodyHtml = substituteTokens(
    packetContext?.templateHtml || defaultHtmlForLocale(packetContext?.locale, packetContext?.variant),
    {
      SCHOOL_NAME: escapeHtml(agencyName),
      AGENCY_NAME: escapeHtml(agencyName),
      SCHOOL_ADDRESS: escapeHtml(agencyAddress),
      AGENCY_ADDRESS: escapeHtml(agencyAddress),
      SCHOOL_STAFF_TABLE: staffTableHtml,
      DISCLOSURE_CARE_TEAM: disclosureHtml
    }
  );

  const watermarkCandidates = [
    path.join(BRAND_DIR, 'ITSCOpnginvisiblebackgroundBW.png'),
    path.join(BRAND_FALLBACK_ROOT, 'ITSCOpnginvisiblebackgroundBW.png')
  ];
  const watermark = firstExistingDataUrl(watermarkCandidates, 'image/png');

  return `
    <div class="packet-body-wrap">
      ${watermark ? `<img class="packet-watermark" src="${watermark}" alt="" />` : ''}
      <div class="packet-body">
        ${bodyHtml}
      </div>
    </div>
  `;
}

function buildOfficePrintablePacketCoverDocument(packetContext = {}) {
  const title = officePacketTitle(packetContext?.variant, packetContext?.locale);
  return wrapPacketHtmlDocument(title, buildOfficeCoverPageHtml(packetContext?.variant, packetContext?.locale));
}

function buildOfficePrintablePacketBodyDocument(packetContext = {}) {
  return wrapPacketHtmlDocument(
    officePacketTitle(packetContext?.variant, packetContext?.locale),
    buildOfficePacketBodyContentHtml(packetContext)
  );
}

export async function generateOfficePrintablePacketPdf({ agencyId, locale = 'en', variant = 'self' } = {}) {
  const packetContext = await buildOfficePrintablePacketContext({ agencyId, locale, variant });

  const coverHtml = buildOfficePrintablePacketCoverDocument(packetContext);
  const bodyHtml = buildOfficePrintablePacketBodyDocument(packetContext);
  const { headerTemplate, footerTemplate } = buildPdfChromeTemplates(packetContext);

  const coverPdfBytes = await DocumentSigningService.convertHTMLToPDF(coverHtml, {
    printBackground: true,
    margin: COVER_PDF_MARGIN,
    preferCSSPageSize: false,
    displayHeaderFooter: false,
    disableFallback: true
  });

  const bodyPdfBytes = await DocumentSigningService.convertHTMLToPDF(bodyHtml, {
    printBackground: true,
    margin: BODY_PDF_MARGIN,
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
    disableFallback: true
  });

  const merged = await PDFDocument.create();
  const coverDoc = await PDFDocument.load(coverPdfBytes);
  const bodyDoc = await PDFDocument.load(bodyPdfBytes);
  const coverPages = await merged.copyPages(coverDoc, coverDoc.getPageIndices());
  coverPages.forEach((p) => merged.addPage(p));
  const bodyPages = await merged.copyPages(bodyDoc, bodyDoc.getPageIndices());
  bodyPages.forEach((p) => merged.addPage(p));

  return Buffer.from(await merged.save());
}

export async function getOfficePacketTemplateForAgency(agencyId, { locale = 'en', variant = 'self' } = {}) {
  const aid = Number(agencyId || 0);
  const loc = normalizeLocale(locale);
  const pack = normalizeOfficePacketVariant(variant);
  const agency = await Agency.findById(aid);
  if (!agency) {
    const err = new Error('Agency not found');
    err.statusCode = 404;
    throw err;
  }
  const template = await OfficePacketTemplate.getOrCreateForAgency(aid, { locale: loc, variant: pack });
  const html = String(template?.html_content || defaultHtmlForLocale(loc, pack));
  return {
    agencyId: aid,
    locale: loc,
    variant: pack,
    title: officePacketTitle(pack, loc),
    html_content: html,
    default_html: defaultOfficePacketHtml(pack, loc),
    looks_like_school_seed: looksLikeSchoolSeedHtml(html),
    version: Number(template?.version || 1),
    updatedAt: template?.updated_at ? new Date(template.updated_at).toISOString() : null,
    updatedByUserId: template?.updated_by_user_id || null
  };
}

export async function saveOfficePacketTemplateForAgency({
  agencyId,
  htmlContent,
  actorUserId = null,
  locale = 'en',
  variant = 'self'
}) {
  const aid = Number(agencyId || 0);
  const loc = normalizeLocale(locale);
  const pack = normalizeOfficePacketVariant(variant);
  const agency = await Agency.findById(aid);
  if (!agency) {
    const err = new Error('Agency not found');
    err.statusCode = 404;
    throw err;
  }
  const saved = await OfficePacketTemplate.upsertContent({
    agencyId: aid,
    htmlContent,
    actorUserId,
    locale: loc,
    variant: pack
  });
  return {
    agencyId: aid,
    locale: loc,
    variant: pack,
    title: officePacketTitle(pack, loc),
    html_content: String(saved?.html_content || ''),
    version: Number(saved?.version || 1),
    updatedAt: saved?.updated_at ? new Date(saved.updated_at).toISOString() : null,
    updatedByUserId: saved?.updated_by_user_id || null
  };
}
