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
import { defaultOfficePacketHtml, applyNluOfficeLegalIfNeeded, tokenizeOfficeDisclosureEntity } from '../content/officePacketTemplateDefault.js';
import { isItscoPacketChromeAgency, isNluPacketChromeAgency, resolvePacketBrandChrome } from './packetBrandChrome.service.js';

const COVER_PDF_MARGIN = { top: '0', right: '0', bottom: '0', left: '0' };
const BODY_PDF_MARGIN = { top: '0.75in', right: '0.5in', bottom: '0.5in', left: '0.5in' };

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

function buildOfficeCoverPageHtml(packetContext = {}) {
  const variant = packetContext?.variant || 'self';
  const locale = packetContext?.locale || 'en';
  const brand = packetContext?.brand || null;
  const cover = brand?.coverDataUrl || null;
  if (!cover) {
    return `
      <section class="packet-cover packet-cover-fallback">
        <h1 class="cover-page-title">${officePacketTitle(variant, locale)}</h1>
      </section>
    `;
  }
  return `
    <section class="packet-cover packet-cover-designed">
      <img class="cover-photo" src="${cover}" alt="${officePacketTitle(variant, locale)} cover" />
    </section>
  `;
}

function wrapPacketHtmlDocument(title, innerHtml, brand = null) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
${buildPacketStyleBlock(brand)}
    </style>
  </head>
  <body>
    ${innerHtml}
  </body>
</html>`;
}

export async function buildOfficePrintablePacketContext({ agencyId, locale = 'en', variant = 'self', service = 'counseling' } = {}) {
  const { buildEnrollmentPacketContext } = await import('./enrollmentPacket.service.js');
  return buildEnrollmentPacketContext({ agencyId, locale, channel: 'office', audience: normalizeOfficePacketVariant(variant) === 'parent' ? 'guardian' : 'self', service });
}

function buildOfficePacketBodyContentHtml(packetContext = {}) {
  const loc = packetContext?.locale || 'en';
  const agencyName = packetContext?.agency?.name || '';
  const agencyAddress = packetContext?.agency?.address || '';
  const agencyPhone = packetContext?.agency?.phone || '';
  const staffTableHtml = buildSchoolStaffTableHtml([], loc);
  const disclosureHtml = buildDisclosureCareTeamHtml(packetContext?.providers || [], loc);
  const brand = packetContext?.brand || null;
  const watermark = brand?.watermarkDataUrl || null;

  const bodyHtml = substituteTokens(
    tokenizeOfficeDisclosureEntity(
      packetContext?.templateHtml || defaultHtmlForLocale(packetContext?.locale, packetContext?.variant)
    ),
    {
      SCHOOL_NAME: escapeHtml(agencyName),
      AGENCY_NAME: escapeHtml(agencyName),
      SCHOOL_ADDRESS: escapeHtml(agencyAddress),
      AGENCY_ADDRESS: escapeHtml(agencyAddress),
      AGENCY_PHONE: escapeHtml(agencyPhone),
      SCHOOL_STAFF_TABLE: staffTableHtml,
      DISCLOSURE_CARE_TEAM: disclosureHtml
    }
  );

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
  return wrapPacketHtmlDocument(
    title,
    buildOfficeCoverPageHtml(packetContext),
    packetContext?.brand || null
  );
}

function buildOfficePrintablePacketBodyDocument(packetContext = {}) {
  return wrapPacketHtmlDocument(
    officePacketTitle(packetContext?.variant, packetContext?.locale),
    buildOfficePacketBodyContentHtml(packetContext),
    packetContext?.brand || null
  );
}

export async function generateOfficePrintablePacketPdf({ agencyId, locale = 'en', variant = 'self', service = 'counseling' } = {}) {
  const { generateEnrollmentPacketPdf } = await import('./enrollmentPacket.service.js');
  return generateEnrollmentPacketPdf({ agencyId, locale, channel: 'office', audience: normalizeOfficePacketVariant(variant) === 'parent' ? 'guardian' : 'self', service });
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
  let html = String(template?.html_content || defaultHtmlForLocale(loc, pack));
  let defaultHtml = defaultOfficePacketHtml(pack, loc);
  if (isNluPacketChromeAgency(agency)) {
    html = applyNluOfficeLegalIfNeeded(html);
    defaultHtml = applyNluOfficeLegalIfNeeded(defaultHtml);
  } else {
    html = tokenizeOfficeDisclosureEntity(html);
    defaultHtml = tokenizeOfficeDisclosureEntity(defaultHtml);
  }
  return {
    agencyId: aid,
    locale: loc,
    variant: pack,
    title: officePacketTitle(pack, loc),
    html_content: html,
    default_html: defaultHtml,
    looks_like_school_seed: looksLikeSchoolSeedHtml(html),
    version: Number(template?.version || 1),
    updatedAt: template?.updated_at ? new Date(template.updated_at).toISOString() : null,
    updatedByUserId: template?.updated_by_user_id || null,
    packetBrand: {
      useItscoChrome: isItscoPacketChromeAgency(agency),
      coverPath: agency.packet_cover_path || null,
      logoPath: agency.packet_logo_path || null,
      footerLogoPath: agency.packet_footer_logo_path || null,
      headerImagePath: agency.packet_header_image_path || null,
      versionLabel: agency.packet_version_label || OFFICE_PRINTABLE_PACKET_VERSION
    }
  };
}

export async function saveOfficePacketTemplateForAgency() {
  throw Object.assign(new Error('Enrollment packets are assembled from individual documents. Edit their source documents in Library → Enrollment documents.'), { status: 409, statusCode: 409 });
}
