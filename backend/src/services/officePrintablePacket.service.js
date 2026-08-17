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

const COVER_PDF_MARGIN = { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' };
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
  const agencyName = String(agency.official_name || agency.name || 'Agency').trim();
  const agencyAddress = buildAgencyAddress(agency);
  const agencyPhone = String(agency.phone_number || agency.phone || '').trim();
  const brand = await resolvePacketBrandChrome(agency, { packetKind: 'office' });
  let templateHtml = String(template?.html_content || defaultHtmlForLocale(loc, pack));
  if (isNluPacketChromeAgency(agency)) {
    templateHtml = applyNluOfficeLegalIfNeeded(templateHtml);
  } else {
    templateHtml = tokenizeOfficeDisclosureEntity(templateHtml);
  }

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
    packetVersionLabel: brand.versionLabel || OFFICE_PRINTABLE_PACKET_VERSION,
    brand,
    generatedAt: new Date(),
    agencyId: aid,
    agency: {
      id: aid,
      name: agencyName,
      slug: String(agency.portal_url || agency.slug || '').trim(),
      address: agencyAddress,
      phone: agencyPhone
    },
    templateHtml,
    providers
  };
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

export async function generateOfficePrintablePacketPdf({ agencyId, locale = 'en', variant = 'self' } = {}) {
  const packetContext = await buildOfficePrintablePacketContext({ agencyId, locale, variant });

  const coverHtml = buildOfficePrintablePacketCoverDocument(packetContext);
  const bodyHtml = buildOfficePrintablePacketBodyDocument(packetContext);
  const { headerTemplate, footerTemplate } = buildPdfChromeTemplates(packetContext);

  const [coverPdfBytes, bodyPdfBytes] = await DocumentSigningService.convertHTMLDocumentsToPdfs(
    [
      {
        html: coverHtml,
        options: {
          printBackground: true,
          margin: COVER_PDF_MARGIN,
          preferCSSPageSize: false,
          displayHeaderFooter: false
        }
      },
      {
        html: bodyHtml,
        options: {
          printBackground: true,
          margin: BODY_PDF_MARGIN,
          preferCSSPageSize: false,
          displayHeaderFooter: true,
          headerTemplate,
          footerTemplate
        }
      }
    ],
    { disableFallback: true }
  );

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
