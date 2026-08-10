import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
import SchoolPacketTemplate from '../models/SchoolPacketTemplate.model.js';
import DocumentSigningService from './documentSigning.service.js';
import {
  listDisclosureProviders,
  formatSupervisorTypeLabel,
  isDemoPacketIdentity
} from './smartDisclosure.service.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import {
  SCHOOL_PRINTABLE_PACKET_VERSION,
  isSchoolPrintablePacketEnabled
} from '../constants/schoolPrintablePacket.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML } from '../content/schoolPacketTemplateDefault.en.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_DIR = path.join(__dirname, '../assets/schoolPrintablePacket/fonts');
const COMFORTAA_PATH = path.join(FONT_DIR, 'Comfortaa-Variable.ttf');
const ANTON_PATH = path.join(FONT_DIR, 'Anton-Regular.ttf');
const BRAND_DIR = path.join(__dirname, '../assets/schoolPrintablePacket/brand');
const BRAND_FALLBACK_ROOT = path.resolve(__dirname, '../../../assets/ITSCO Brand');
/** Header wordmark PNG (from ITSCO Brand / Google export image1). */
const HEADER_LOGO_CANDIDATES = [
  path.join(BRAND_DIR, 'header-logo.png'),
  path.join(BRAND_DIR, 'image1.jpg'),
  path.join(BRAND_FALLBACK_ROOT, 'images', 'image1.jpg')
];
/** Bottom-left footer mark: ITSCOpnginvisiblebackgroundBW. */
const FOOTER_MARK_CANDIDATES = [
  path.join(BRAND_DIR, 'footer-mark-bw.png'),
  path.join(BRAND_DIR, 'ITSCOpnginvisiblebackgroundBW.png'),
  path.join(BRAND_FALLBACK_ROOT, 'ITSCOpnginvisiblebackgroundBW.png')
];
const WATERMARK_CANDIDATES = [
  path.join(BRAND_DIR, 'ITSCOpnginvisiblebackgroundBW.png'),
  path.join(BRAND_DIR, 'itsco-watermark-bw.png'),
  path.join(BRAND_FALLBACK_ROOT, 'ITSCOpnginvisiblebackgroundBW.png')
];
const COVER_PAGE_CANDIDATES = [
  path.join(BRAND_DIR, 'cover-page.png')
];

const PAGE_SIZE = { widthIn: 8.5, heightIn: 11 };

const _dataUrlCache = new Map();

function fileToDataUrl(filePath, mime) {
  if (_dataUrlCache.has(filePath)) return _dataUrlCache.get(filePath);
  const base64 = fs.readFileSync(filePath).toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;
  _dataUrlCache.set(filePath, dataUrl);
  return dataUrl;
}

function comfortaaDataUrl() {
  return fileToDataUrl(COMFORTAA_PATH, 'font/ttf');
}

function antonDataUrl() {
  return fileToDataUrl(ANTON_PATH, 'font/ttf');
}

function resolveBrandFile(filename) {
  const primary = path.join(BRAND_DIR, filename);
  if (fs.existsSync(primary)) return primary;
  const fallbackImage = path.join(BRAND_FALLBACK_ROOT, 'images', filename);
  if (fs.existsSync(fallbackImage)) return fallbackImage;
  const fallbackRoot = path.join(BRAND_FALLBACK_ROOT, filename);
  if (fs.existsSync(fallbackRoot)) return fallbackRoot;
  throw new Error(`Missing school packet brand asset: ${filename}`);
}

function brandImageDataUrl(filename, mime) {
  return fileToDataUrl(resolveBrandFile(filename), mime);
}

function firstExistingDataUrl(candidates, mime) {
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return fileToDataUrl(filePath, mime);
  }
  return null;
}

function headerLogoDataUrl() {
  return firstExistingDataUrl(HEADER_LOGO_CANDIDATES, 'image/png')
    || firstExistingDataUrl(
      [path.join(BRAND_DIR, 'image1.jpg'), path.join(BRAND_FALLBACK_ROOT, 'images', 'image1.jpg')],
      'image/jpeg'
    );
}

function footerMarkDataUrl() {
  return firstExistingDataUrl(FOOTER_MARK_CANDIDATES, 'image/png');
}

function watermarkDataUrl() {
  return firstExistingDataUrl(WATERMARK_CANDIDATES, 'image/png');
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

function buildSchoolAddress(organization = {}) {
  const direct = String(
    organization?.school_profile?.school_address
    || organization?.school_address
    || organization?.street_address
    || ''
  ).trim();
  if (direct) return direct;
  const parts = [
    organization?.street_address,
    organization?.city,
    organization?.state,
    organization?.postal_code
  ].map((part) => String(part || '').trim()).filter(Boolean);
  return parts.join(', ') || '';
}

async function resolveAgencyIdForSchool(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

export function groupDisclosureProvidersByCareTeam(providers = []) {
  const list = Array.isArray(providers) ? providers : [];
  const yourCareTeam = [];
  const potentialCareTeam = [];
  const seen = new Set();
  for (const p of list) {
    const id = Number(p?.id || p?.userId || 0);
    const key = id || String(p?.fullName || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    if (isDemoPacketIdentity(p)) continue;
    seen.add(key);
    if (p?.schoolAssigned || p?.careTeamExpanded) yourCareTeam.push(p);
    else potentialCareTeam.push(p);
  }
  return { yourCareTeam, potentialCareTeam };
}

/**
 * Your care team = school-assigned providers, plus their supervisors and
 * supervisees from the agency roster (deduped; demo identities excluded).
 */
export async function expandYourCareTeamProviders(providers = [], { agencyId } = {}) {
  const list = (Array.isArray(providers) ? providers : [])
    .filter((p) => p && !isDemoPacketIdentity(p));
  const byId = new Map();
  for (const p of list) {
    const id = Number(p.id || p.userId || 0);
    if (!id || byId.has(id)) continue;
    byId.set(id, { ...p, supervisors: [...(p.supervisors || [])] });
  }

  const seedIds = new Set(
    [...byId.values()].filter((p) => p.schoolAssigned).map((p) => Number(p.id))
  );
  const expandedIds = new Set(seedIds);

  for (const id of seedIds) {
    const provider = byId.get(id);
    if (!provider) continue;

    for (const s of provider.supervisors || []) {
      const match = [...byId.values()].find(
        (x) => String(x.fullName || '').trim().toLowerCase() === String(s.fullName || '').trim().toLowerCase()
      );
      if (match && !isDemoPacketIdentity(match)) expandedIds.add(Number(match.id));
    }

    if (agencyId) {
      try {
        const supervisees = await SupervisorAssignment.findBySupervisor(id, agencyId);
        for (const row of supervisees || []) {
          const sid = Number(row.supervisee_id || 0);
          const person = byId.get(sid);
          if (person && !isDemoPacketIdentity(person)) expandedIds.add(sid);
        }
      } catch {
        // ignore
      }
    }
  }

  const out = [];
  const seen = new Set();
  for (const p of byId.values()) {
    const id = Number(p.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const inCareTeam = expandedIds.has(id);
    out.push({
      ...p,
      schoolAssigned: inCareTeam ? true : !!p.schoolAssigned,
      careTeamExpanded: inCareTeam && !p.schoolAssigned,
      supervisors: (p.supervisors || []).map((s) => ({
        ...s,
        type: formatSupervisorTypeLabel(s.type || 'clinical')
      }))
    });
  }
  return out;
}

function renderProviderCardHtml(provider = {}) {
  const detailLines = [];
  if (provider.title) detailLines.push(`<div class="packet-provider-line"><em>${escapeHtml(provider.title)}</em></div>`);
  if (provider.credential) detailLines.push(`<div class="packet-provider-line"><strong>Credential:</strong> ${escapeHtml(provider.credential)}</div>`);
  if (provider.licenseNumber) detailLines.push(`<div class="packet-provider-line"><strong>License #:</strong> ${escapeHtml(provider.licenseNumber)}</div>`);
  if (provider.serviceProvider && provider.category === 'UNLICENSED') {
    detailLines.push(`<div class="packet-provider-line"><strong>Service Provider:</strong> ${escapeHtml(provider.serviceProvider)}</div>`);
  }
  if (provider.education) detailLines.push(`<div class="packet-provider-line"><strong>Education:</strong> ${escapeHtml(provider.education)}</div>`);
  for (const s of provider.supervisors || []) {
    const typeLabel = formatSupervisorTypeLabel(s.type || 'clinical');
    detailLines.push(
      `<div class="packet-provider-line"><strong>Supervisor:</strong> ${escapeHtml(s.fullName)}${typeLabel ? `, ${escapeHtml(typeLabel)}` : ''}</div>`
    );
  }
  if (provider.regulatoryBoard) {
    detailLines.push(`<div class="packet-provider-line"><strong>Specific Regulatory Board:</strong> ${escapeHtml(provider.regulatoryBoard)}</div>`);
  }

  return `
    <div class="packet-provider">
      <div class="packet-provider-name">${escapeHtml(provider.fullName || '')}</div>
      ${detailLines.join('')}
    </div>
  `;
}

function renderProviderGroupHtml(providers = []) {
  const groups = [
    { key: 'FULLY_LICENSED', label: 'Fully Licensed', items: [] },
    { key: 'PRE_LICENSED', label: 'Pre-Licensed', items: [] },
    { key: 'UNLICENSED', label: 'Unlicensed / Other', items: [] }
  ];
  for (const p of providers) {
    const g = groups.find((x) => x.key === p.category) || groups[2];
    g.items.push(p);
  }
  return groups.map((g) => {
    if (!g.items.length) return '';
    return `
      <h4 class="packet-subhead">${escapeHtml(g.label)}</h4>
      ${g.items.map((p) => renderProviderCardHtml(p)).join('')}
    `;
  }).join('');
}

export function buildDisclosureCareTeamHtml(providers = []) {
  const { yourCareTeam, potentialCareTeam } = groupDisclosureProvidersByCareTeam(providers);
  return `
    <section class="packet-care-team">
      <h3 class="packet-section-title">Your Care Team</h3>
      ${yourCareTeam.length
        ? renderProviderGroupHtml(yourCareTeam)
        : '<p><em>No school-assigned providers are listed at this time.</em></p>'}
      <h3 class="packet-section-title">Potential Care Team Members</h3>
      ${potentialCareTeam.length
        ? renderProviderGroupHtml(potentialCareTeam)
        : '<p><em>No additional agency providers are listed at this time.</em></p>'}
    </section>
  `;
}

export function buildSchoolStaffTableHtml(staffRows = []) {
  const rows = Array.isArray(staffRows) ? staffRows : [];
  const body = rows.length
    ? rows.map((r) => {
        const name = String(`${r.first_name || ''} ${r.last_name || ''}`).trim() || '—';
        const title = String(r.role_title || '').trim() || '—';
        const phone = String(r.phone_number || '').trim() || '—';
        const email = String(r.email || '').trim() || '—';
        return `<tr>
          <td class="deny-cell"><label class="deny-label"><span class="deny-box">☐</span> Deny</label></td>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(title)}</td>
          <td>${escapeHtml(phone)}</td>
          <td>${escapeHtml(email)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5"><em>No authorized school staff listed.</em></td></tr>`;

  return `
    <table class="packet-staff-table">
      <thead>
        <tr>
          <th class="deny-col">Deny</th>
          <th>Name</th>
          <th>Relationship / Role</th>
          <th>Phone</th>
          <th>Email</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function buildCoverPageHtml(packetContext = {}) {
  // Uneditable cover: exact photo of page 1 from the master packet PDF.
  const cover = coverPageDataUrl();
  const schoolName = String(packetContext?.organization?.name || 'School').trim();
  if (!cover) {
    return `
      <section class="packet-cover packet-cover-fallback">
        <h1 class="cover-title">${escapeHtml(schoolName)} School Packet</h1>
      </section>
    `;
  }
  return `
    <section class="packet-cover">
      <img class="cover-photo" src="${cover}" alt="${escapeHtml(schoolName)} School Packet cover" />
      <div class="cover-school-banner">${escapeHtml(schoolName)} School Packet</div>
    </section>
  `;
}

function substituteTokens(templateHtml, tokens = {}) {
  let html = String(templateHtml || '');
  for (const [key, value] of Object.entries(tokens)) {
    const token = `{{${key}}}`;
    html = html.split(token).join(String(value ?? ''));
  }
  return html;
}

export async function buildSchoolPrintablePacketContext({ organizationId } = {}) {
  const orgId = Number(organizationId || 0);
  if (!orgId) throw new Error('Invalid organizationId');

  const organization = await Agency.findById(orgId);
  if (!organization) {
    const err = new Error('Organization not found');
    err.statusCode = 404;
    throw err;
  }
  if (!isSchoolPrintablePacketEnabled(organization)) {
    const err = new Error('Smart printable packet is not enabled for this school');
    err.statusCode = 404;
    throw err;
  }

  const agencyId = await resolveAgencyIdForSchool(orgId);
  const template = agencyId
    ? await SchoolPacketTemplate.getOrCreateForAgency(agencyId)
    : {
        version: 1,
        html_content: DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,
        is_default_fallback: true
      };

  const staffRows = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization({
    schoolOrganizationId: orgId
  });

  let providers = [];
  if (agencyId) {
    try {
      const raw = await listDisclosureProviders({
        agencyId,
        schoolOrganizationId: orgId
      });
      providers = await expandYourCareTeamProviders(raw, { agencyId });
    } catch {
      providers = [];
    }
  }

  return {
    version: Number(template?.version || 1),
    packetVersionLabel: SCHOOL_PRINTABLE_PACKET_VERSION,
    generatedAt: new Date(),
    agencyId: agencyId || null,
    organization: {
      id: orgId,
      name: String(organization.name || 'School').trim(),
      slug: String(organization.portal_url || organization.slug || '').trim(),
      address: buildSchoolAddress(organization)
    },
    templateHtml: String(template?.html_content || DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML),
    staffRows,
    providers
  };
}

export function buildSchoolPrintablePacketHtml(packetContext = {}) {
  const schoolName = packetContext?.organization?.name || '';
  const schoolAddress = packetContext?.organization?.address || '';

  const staffTableHtml = buildSchoolStaffTableHtml(packetContext?.staffRows || []);
  const disclosureHtml = buildDisclosureCareTeamHtml(packetContext?.providers || []);
  const watermark = watermarkDataUrl();

  const bodyHtml = substituteTokens(
    packetContext?.templateHtml || DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,
    {
      SCHOOL_NAME: escapeHtml(schoolName),
      SCHOOL_ADDRESS: escapeHtml(schoolAddress),
      SCHOOL_STAFF_TABLE: staffTableHtml,
      DISCLOSURE_CARE_TEAM: disclosureHtml
    }
  );

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(schoolName || 'School')} — Intake Packet</title>
    <style>
      @font-face {
        font-family: 'Comfortaa';
        src: url('${comfortaaDataUrl()}');
        font-weight: 300 700;
        font-display: swap;
      }
      @font-face {
        font-family: 'Anton';
        src: url('${antonDataUrl()}');
        font-weight: 400;
        font-display: swap;
      }
      @page {
        size: ${PAGE_SIZE.widthIn}in ${PAGE_SIZE.heightIn}in;
        margin: 0;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        color: #111;
        font-family: 'Comfortaa', Arial, sans-serif;
        font-size: 11.5px;
        line-height: 1.45;
      }
      .packet-cover {
        width: 100%;
        min-height: 9.2in;
        margin: 0;
        padding: 0.2in 0.35in 0.4in;
        page-break-after: always;
        position: relative;
        overflow: hidden;
      }
      .cover-banner {
        display: block;
        width: 78%;
        max-width: 6.4in;
        height: auto;
        margin: 0.15in auto 0.45in;
      }
      .cover-hero {
        position: relative;
        width: 100%;
        height: 5.4in;
        margin: 0 auto;
      }
      .cover-square {
        position: absolute;
        left: 8%;
        top: 8%;
        width: 58%;
        height: auto;
      }
      .cover-figure {
        position: absolute;
        right: 2%;
        bottom: 0;
        width: 48%;
        height: auto;
      }
      .cover-title-block {
        position: absolute;
        left: 0.5in;
        right: 0.5in;
        bottom: 0.55in;
        text-align: center;
      }
      .cover-kicker {
        font-weight: 700;
        letter-spacing: 0.08em;
        font-size: 13px;
        margin-bottom: 0.15in;
      }
      .cover-title {
        margin: 0;
        font-size: 34px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .packet-body {
        max-width: 100%;
        position: relative;
        z-index: 1;
      }
      .packet-watermark {
        position: fixed;
        left: 50%;
        top: 50%;
        width: 5.2in;
        height: auto;
        transform: translate(-50%, -50%);
        opacity: 0.07;
        z-index: 0;
        pointer-events: none;
      }
      .packet-body h1, .packet-body h2, .packet-body h3, .packet-body h4 {
        font-family: 'Comfortaa', Arial, sans-serif;
        page-break-after: avoid;
      }
      .packet-body h1,
      .packet-body h2,
      .packet-section-title,
      .packet-subhead {
        text-align: center;
        font-weight: 700;
      }
      .packet-body h1 { font-size: 22px; margin: 0 0 14px; letter-spacing: 0.03em; }
      .packet-body h2 { font-size: 17px; margin: 18px 0 10px; letter-spacing: 0.02em; }
      .packet-body h3,
      .packet-section-title { font-size: 16px; margin: 18px 0 12px; letter-spacing: 0.03em; }
      .packet-subhead { font-size: 14px; margin: 16px 0 10px; }
      .packet-body p, .packet-body li { margin: 0 0 8px; }
      .packet-body table {
        width: 100%;
        border-collapse: collapse;
        margin: 10px 0 14px;
      }
      .packet-body th, .packet-body td {
        border: 1px solid #333;
        padding: 6px 8px;
        vertical-align: top;
        text-align: left;
      }
      .form-blank {
        min-width: 1.4in;
        height: 22px;
        background: #fff;
      }
      .form-blank-sm { min-width: 0.7in; }
      .form-blank::after { content: none !important; }
      .packet-staff-table th { background: #f3f4f6; font-weight: 700; }
      .deny-col, .deny-cell { width: 0.85in; text-align: center; white-space: nowrap; }
      .deny-label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
      .deny-box { font-size: 14px; line-height: 1; }
      .packet-provider {
        margin: 0 0 14px;
        padding: 0 0 10px;
        border-bottom: 1px solid #d1d5db;
        page-break-inside: avoid;
      }
      .packet-provider:last-child { border-bottom: 0; }
      .packet-provider-name {
        font-weight: 700;
        font-size: 12.5px;
        margin: 0 0 2px;
      }
      .packet-provider-line {
        margin: 0;
        line-height: 1.25;
        font-size: 11px;
      }
      .page-break {
        display: block;
        page-break-before: always;
        break-before: page;
        height: 0;
        margin: 0;
        padding: 0;
        border: 0;
      }
      .packet-body-wrap {
        padding: 0;
        position: relative;
      }
      @media screen {
        body { background: #e5e7eb; }
        .packet-cover, .packet-body-wrap {
          background: #fff;
          width: ${PAGE_SIZE.widthIn}in;
          min-height: ${PAGE_SIZE.heightIn}in;
          margin: 16px auto;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          padding: 0.6in 0.7in;
        }
        .packet-cover { padding: 0.35in; }
      }
    </style>
  </head>
  <body>
    ${buildCoverPageHtml()}
    <div class="packet-body-wrap">
      ${watermark ? `<img class="packet-watermark" src="${watermark}" alt="" />` : ''}
      <div class="packet-body">
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;
}

function buildPdfChromeTemplates(packetContext = {}) {
  const packetVersionLabel = packetContext?.packetVersionLabel || SCHOOL_PRINTABLE_PACKET_VERSION;
  const templateVersion = packetContext?.version || 1;
  const logo = headerLogoDataUrl();
  const footerMark = footerMarkDataUrl();
  // Single large wordmark only (image1). Do not also inject a body header logo.
  const headerTemplate = `
    <div style="width:100%; padding:0 0.75in; box-sizing:border-box; text-align:center;">
      <img src="${logo}" style="height:36px; width:auto; max-width:5.8in; object-fit:contain;" />
    </div>
  `;
  const footerTemplate = `
    <div style="width:100%; padding:0 0.75in; box-sizing:border-box; color:#222; display:flex; justify-content:space-between; align-items:center; font-size:10px;">
      <div style="display:flex; align-items:center; gap:8px; font-family: Impact, Anton, Arial Black, sans-serif;">
        ${footerMark ? `<img src="${footerMark}" style="height:16px; width:auto; object-fit:contain;" />` : ''}
        <span>Version ${escapeHtml(String(packetVersionLabel))} · Template v${escapeHtml(String(templateVersion))}</span>
      </div>
      <span style="font-family: Impact, Anton, Arial Black, sans-serif;">PAGE <span class="pageNumber"></span></span>
    </div>
  `;
  return { headerTemplate, footerTemplate };
}

export async function generateSchoolPrintablePacketPdf(packetContext) {
  const html = buildSchoolPrintablePacketHtml(packetContext);
  const { headerTemplate, footerTemplate } = buildPdfChromeTemplates(packetContext);
  return DocumentSigningService.convertHTMLToPDF(html, {
    printBackground: true,
    // ~1" top/bottom so header/footer never overlap body text.
    margin: { top: '1in', right: '0.7in', bottom: '1in', left: '0.7in' },
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
    disableFallback: true
  });
}

export async function getSchoolPrintablePacketAvailability(organizationId) {
  const organization = await Agency.findById(Number(organizationId || 0));
  if (!organization || !isSchoolPrintablePacketEnabled(organization)) {
    return { available: false };
  }
  const agencyId = await resolveAgencyIdForSchool(Number(organizationId));
  const template = agencyId ? await SchoolPacketTemplate.findByAgencyId(agencyId) : null;
  return {
    available: true,
    version: Number(template?.version || 1),
    packetVersionLabel: SCHOOL_PRINTABLE_PACKET_VERSION,
    title: `${String(organization.name || 'School').trim()} — Blank Referral Packet (Smart)`,
    updatedAt: template?.updated_at
      ? new Date(template.updated_at).toISOString()
      : new Date().toISOString()
  };
}

export async function getSchoolPacketTemplateForOrganization(organizationId) {
  const orgId = Number(organizationId || 0);
  const organization = await Agency.findById(orgId);
  if (!organization) {
    const err = new Error('Organization not found');
    err.statusCode = 404;
    throw err;
  }
  if (!isSchoolPrintablePacketEnabled(organization)) {
    const err = new Error('Smart printable packet is not enabled for this school');
    err.statusCode = 404;
    throw err;
  }
  const agencyId = await resolveAgencyIdForSchool(orgId);
  if (!agencyId) {
    const err = new Error('No affiliated agency found for this school');
    err.statusCode = 409;
    throw err;
  }
  const template = await SchoolPacketTemplate.getOrCreateForAgency(agencyId);
  return {
    agencyId,
    html_content: String(template?.html_content || DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML),
    version: Number(template?.version || 1),
    updatedAt: template?.updated_at ? new Date(template.updated_at).toISOString() : null,
    updatedByUserId: template?.updated_by_user_id || null
  };
}

export async function saveSchoolPacketTemplateForOrganization({
  organizationId,
  htmlContent,
  actorUserId = null
}) {
  const orgId = Number(organizationId || 0);
  const organization = await Agency.findById(orgId);
  if (!organization) {
    const err = new Error('Organization not found');
    err.statusCode = 404;
    throw err;
  }
  if (!isSchoolPrintablePacketEnabled(organization)) {
    const err = new Error('Smart printable packet is not enabled for this school');
    err.statusCode = 404;
    throw err;
  }
  const agencyId = await resolveAgencyIdForSchool(orgId);
  if (!agencyId) {
    const err = new Error('No affiliated agency found for this school');
    err.statusCode = 409;
    throw err;
  }
  const saved = await SchoolPacketTemplate.upsertContent({
    agencyId,
    htmlContent,
    actorUserId
  });
  return {
    agencyId,
    html_content: String(saved?.html_content || ''),
    version: Number(saved?.version || 1),
    updatedAt: saved?.updated_at ? new Date(saved.updated_at).toISOString() : null,
    updatedByUserId: saved?.updated_by_user_id || null
  };
}
