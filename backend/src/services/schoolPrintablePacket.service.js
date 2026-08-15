import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
import SchoolPacketTemplate, {
  normalizeLocale,
  defaultHtmlForLocale
} from '../models/SchoolPacketTemplate.model.js';
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
import { injectIntakeLegalIntoPacketHtml, resolveIntakeLegalFromTheme } from '../content/intakeLegalCopy.js';

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
/** Bottom-left footer mark: ITSCOpnginvisiblebackgroundBW (black ITSCO mark). */
const FOOTER_MARK_CANDIDATES = [
  path.join(BRAND_DIR, 'footer-mark-from-bw.png'),
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

  // No school-assigned providers → treat the full agency roster as the care team
  // ("everyone"), still excluding demo identities.
  if (seedIds.size === 0) {
    return [...byId.values()].map((p) => ({
      ...p,
      schoolAssigned: true,
      careTeamExpanded: false,
      supervisors: (p.supervisors || []).map((s) => ({
        ...s,
        type: formatSupervisorTypeLabel(s.type || 'clinical')
      }))
    }));
  }

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

/**
 * Labels for the dynamically-generated sections (staff roster, care team).
 * These are the two sections that change often (new staff/providers), so
 * they're localized once in code here rather than in the editable template
 * text — new rows never need a manual translation pass.
 */
const CARE_TEAM_LABELS = {
  en: {
    yourCareTeam: 'Your Care Team',
    potentialCareTeam: 'Potential Care Team Members',
    fullyLicensed: 'Fully Licensed',
    preLicensed: 'Pre-Licensed',
    unlicensedOther: 'Unlicensed / Other',
    credential: 'Credential:',
    licenseNumber: 'License #:',
    serviceProvider: 'Service Provider:',
    education: 'Education:',
    supervisor: 'Supervisor:',
    regulatoryBoard: 'Specific Regulatory Board:',
    noSchoolAssigned: 'No school-assigned providers are listed at this time.',
    noAdditionalAgency: 'No additional agency providers are listed at this time.'
  },
  es: {
    yourCareTeam: 'Su Equipo de Atención',
    potentialCareTeam: 'Posibles Miembros del Equipo de Atención',
    fullyLicensed: 'Con Licencia Completa',
    preLicensed: 'Pre-Licenciado',
    unlicensedOther: 'Sin Licencia / Otro',
    credential: 'Credencial:',
    licenseNumber: 'Núm. de Licencia:',
    serviceProvider: 'Proveedor de Servicio:',
    education: 'Educación:',
    supervisor: 'Supervisor:',
    regulatoryBoard: 'Junta Regulatoria Específica:',
    noSchoolAssigned: 'No hay proveedores asignados a la escuela en este momento.',
    noAdditionalAgency: 'No hay proveedores adicionales de la agencia en este momento.'
  }
};

const STAFF_TABLE_LABELS = {
  en: { deny: 'Deny', name: 'Name', role: 'Relationship / Role', phone: 'Phone', email: 'Email' },
  es: { deny: 'Denegar', name: 'Nombre', role: 'Relación / Rol', phone: 'Teléfono', email: 'Correo Electrónico' }
};

function careTeamLabels(locale) {
  const loc = String(locale || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  return CARE_TEAM_LABELS[loc];
}

function staffTableLabels(locale) {
  const loc = String(locale || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  return STAFF_TABLE_LABELS[loc];
}

function renderProviderCardHtml(provider = {}, locale = 'en') {
  const L = careTeamLabels(locale);
  const detailLines = [];
  if (provider.title) detailLines.push(`<div class="packet-provider-line"><em>${escapeHtml(provider.title)}</em></div>`);
  if (provider.credential) detailLines.push(`<div class="packet-provider-line"><strong>${L.credential}</strong> ${escapeHtml(provider.credential)}</div>`);
  if (provider.licenseNumber) detailLines.push(`<div class="packet-provider-line"><strong>${L.licenseNumber}</strong> ${escapeHtml(provider.licenseNumber)}</div>`);
  if (provider.serviceProvider && provider.category === 'UNLICENSED') {
    detailLines.push(`<div class="packet-provider-line"><strong>${L.serviceProvider}</strong> ${escapeHtml(provider.serviceProvider)}</div>`);
  }
  if (provider.education) detailLines.push(`<div class="packet-provider-line"><strong>${L.education}</strong> ${escapeHtml(provider.education)}</div>`);
  for (const s of provider.supervisors || []) {
    const typeLabel = formatSupervisorTypeLabel(s.type || 'clinical');
    detailLines.push(
      `<div class="packet-provider-line"><strong>${L.supervisor}</strong> ${escapeHtml(s.fullName)}${typeLabel ? `, ${escapeHtml(typeLabel)}` : ''}</div>`
    );
  }
  if (provider.regulatoryBoard) {
    detailLines.push(`<div class="packet-provider-line"><strong>${L.regulatoryBoard}</strong> ${escapeHtml(provider.regulatoryBoard)}</div>`);
  }

  return `
    <div class="packet-provider">
      <div class="packet-provider-name">${escapeHtml(provider.fullName || '')}</div>
      ${detailLines.join('')}
    </div>
  `;
}

function renderProviderGroupHtml(providers = [], locale = 'en') {
  const L = careTeamLabels(locale);
  const groups = [
    { key: 'FULLY_LICENSED', label: L.fullyLicensed, items: [] },
    { key: 'PRE_LICENSED', label: L.preLicensed, items: [] },
    { key: 'UNLICENSED', label: L.unlicensedOther, items: [] }
  ];
  for (const p of providers) {
    const g = groups.find((x) => x.key === p.category) || groups[2];
    g.items.push(p);
  }
  return groups.map((g) => {
    if (!g.items.length) return '';
    return `
      <h4 class="packet-subhead">${escapeHtml(g.label)}</h4>
      ${g.items.map((p) => renderProviderCardHtml(p, locale)).join('')}
    `;
  }).join('');
}

export function buildDisclosureCareTeamHtml(providers = [], locale = 'en') {
  const L = careTeamLabels(locale);
  let { yourCareTeam, potentialCareTeam } = groupDisclosureProvidersByCareTeam(providers);
  // Empty school care team + agency providers available → show everyone as care team.
  if (!yourCareTeam.length && potentialCareTeam.length) {
    yourCareTeam = potentialCareTeam;
    potentialCareTeam = [];
  }
  return `
    <section class="packet-care-team">
      <h3 class="packet-section-title">${L.yourCareTeam}</h3>
      ${yourCareTeam.length
        ? renderProviderGroupHtml(yourCareTeam, locale)
        : `<p><em>${L.noSchoolAssigned}</em></p>`}
      ${potentialCareTeam.length
        ? `<div class="packet-potential-team">
        <h3 class="packet-section-title">${L.potentialCareTeam}</h3>
        ${renderProviderGroupHtml(potentialCareTeam, locale)}
      </div>`
        : ''}
    </section>
  `;
}

function blankStaffRowHtml(locale = 'en') {
  const L = staffTableLabels(locale);
  return `<tr>
          <td class="deny-cell"><label class="deny-label"><span class="deny-box">☐</span> ${L.deny}</label></td>
          <td class="form-blank"></td>
          <td class="form-blank"></td>
          <td class="form-blank"></td>
          <td class="form-blank"></td>
        </tr>`;
}

export function buildSchoolStaffTableHtml(staffRows = [], locale = 'en') {
  const L = staffTableLabels(locale);
  const rows = Array.isArray(staffRows) ? staffRows : [];
  // Always leave handwritten fill-ins: 4 when empty (rare), otherwise +2 blank rows.
  const blankCount = rows.length === 0 ? 4 : 2;
  const filled = rows.map((r) => {
    const name = String(`${r.first_name || ''} ${r.last_name || ''}`).trim() || '—';
    const title = String(r.role_title || '').trim() || '—';
    const phone = String(r.phone_number || '').trim() || '—';
    const email = String(r.email || '').trim() || '—';
    return `<tr>
          <td class="deny-cell"><label class="deny-label"><span class="deny-box">☐</span> ${L.deny}</label></td>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(title)}</td>
          <td>${escapeHtml(phone)}</td>
          <td>${escapeHtml(email)}</td>
        </tr>`;
  }).join('');
  const blanks = Array.from({ length: blankCount }, () => blankStaffRowHtml(locale)).join('');
  const body = `${filled}${blanks}`;

  return `
    <table class="packet-staff-table">
      <colgroup>
        <col style="width:12%" />
        <col style="width:22%" />
        <col style="width:22%" />
        <col style="width:20%" />
        <col style="width:24%" />
      </colgroup>
      <thead>
        <tr>
          <th class="deny-col">${L.deny}</th>
          <th>${L.name}</th>
          <th>${L.role}</th>
          <th>${L.phone}</th>
          <th>${L.email}</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function buildCoverPageHtml(packetContext = {}) {
  // Uneditable cover: exact copy of page 1 from the master packet PDF, plus a
  // dynamic school title header. No watermark, header/footer chrome, or page
  // number belongs on this page — it is rendered as its own standalone PDF.
  const cover = coverPageDataUrl();
  const schoolName = String(packetContext?.organization?.name || 'School').trim();
  const title = `<h1 class="cover-page-title">${escapeHtml(schoolName)} School Packet</h1>`;
  if (!cover) {
    return `
      <section class="packet-cover packet-cover-fallback">
        ${title}
      </section>
    `;
  }
  return `
    <section class="packet-cover">
      <img class="cover-photo" src="${cover}" alt="${escapeHtml(schoolName)} School Packet cover" />
      ${title}
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

export async function buildSchoolPrintablePacketContext({ organizationId, locale = 'en' } = {}) {
  const orgId = Number(organizationId || 0);
  if (!orgId) throw new Error('Invalid organizationId');
  const loc = normalizeLocale(locale);

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
  const tenantAgency = agencyId ? await Agency.findById(agencyId) : null;
  const template = agencyId
    ? await SchoolPacketTemplate.getOrCreateForAgency(agencyId, { locale: loc })
    : {
        version: 1,
        locale: loc,
        html_content: defaultHtmlForLocale(loc),
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
    locale: loc,
    packetVersionLabel: SCHOOL_PRINTABLE_PACKET_VERSION,
    generatedAt: new Date(),
    agencyId: agencyId || null,
    organization: {
      id: orgId,
      name: String(organization.name || 'School').trim(),
      slug: String(organization.portal_url || organization.slug || '').trim(),
      address: buildSchoolAddress(organization)
    },
    templateHtml: injectIntakeLegalIntoPacketHtml(
      String(template?.html_content || defaultHtmlForLocale(loc) || DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML),
      resolveIntakeLegalFromTheme(tenantAgency?.theme_settings, loc)
    ),
    staffRows,
    providers
  };
}

function buildPacketStyleBlock() {
  return `
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
      /* No explicit @page margin here: Chrome's PDF engine honors an @page
         margin (even 0) over Puppeteer's page.pdf() margin option, which was
         collapsing our 0.5in print margins to nothing. Margins are controlled
         solely via the margin option passed to page.pdf() in this service. */
      @page {
        size: ${PAGE_SIZE.widthIn}in ${PAGE_SIZE.heightIn}in;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        color: #111;
        font-family: 'Comfortaa', Arial, sans-serif;
        font-size: 13.3px; /* ~10pt */
        line-height: 1.5;
      }
      .packet-cover {
        width: 100%;
        min-height: 10in;
        height: 10in;
        margin: 0;
        padding: 0.25in 0;
        page-break-after: always;
        position: relative;
        overflow: hidden;
        background: #fff;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .cover-page-title {
        margin: 0.3in 0 0;
        text-align: center;
        font-family: 'Comfortaa', Arial, sans-serif;
        font-weight: 700;
        font-size: 30px;
        letter-spacing: 0.03em;
      }
      .cover-photo {
        display: block;
        width: 100%;
        max-height: 8.6in;
        height: auto;
        object-fit: contain;
        object-position: center center;
      }
      .cover-title {
        margin: 1in auto;
        text-align: center;
        font-size: 28px;
        font-weight: 700;
      }
      .packet-body {
        max-width: 100%;
        position: relative;
        z-index: 1;
      }
      /* Fixed watermark paints on every printed content page (never on the cover, which is its own PDF). */
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
      .packet-body h1 { font-size: 30px; margin: 0 0 16px; letter-spacing: 0.03em; }
      .packet-body h2 { font-size: 22px; margin: 20px 0 12px; letter-spacing: 0.02em; }
      .packet-body h3,
      .packet-section-title { font-size: 18px; margin: 18px 0 12px; letter-spacing: 0.03em; }
      .packet-subhead { font-size: 16px; margin: 16px 0 10px; }
      .packet-body p, .packet-body li { margin: 0 0 9px; }
      /* table-layout:fixed + no min-width blanks keeps tables from overflowing
         the page. border-collapse:separate (not collapse) is deliberate: with
         collapsed borders, a table sized to exactly 100% of its container has
         its shared right/bottom border line centered ON the boundary, so half
         of it renders past the edge — Chromium's print-to-PDF then clips that
         half, making the right/bottom border of the table disappear. Separate
         borders paint fully inside each cell's own box, so they can never be
         clipped by the page margin. border-spacing:0 plus right/bottom-only
         cell borders (with top/left on the table itself) recreate a normal
         1px grid without doubling the interior lines. */
      .packet-body table {
        width: 100%;
        max-width: 100%;
        table-layout: fixed;
        border-collapse: separate;
        border-spacing: 0;
        border-top: 1px solid #111;
        border-left: 1px solid #111;
        margin: 10px 0 16px;
      }
      .packet-body th, .packet-body td {
        border-right: 1px solid #111;
        border-bottom: 1px solid #111;
        padding: 7px 9px;
        vertical-align: top;
        text-align: left;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .form-blank {
        min-width: 0;
        height: 25px;
        background: #fff;
      }
      .form-blank-sm { min-width: 0; }
      .form-blank::after { content: none !important; }
      /* Label + writing line in one cell so the line starts right after the label. */
      .inline-fill {
        display: flex;
        align-items: flex-end;
        gap: 6px;
        width: 100%;
      }
      .inline-fill-label {
        flex: 0 0 auto;
        white-space: nowrap;
        font-weight: 600;
      }
      .inline-fill-line {
        flex: 1 1 auto;
        border-bottom: 1.5px solid #111;
        min-height: 20px;
      }
      /* Plain (non-boxed) label + line, one per row — used for "Your name",
         "Your phone number", etc. so there's exactly one line, not a bordered
         table cell around it plus a second inline writing line inside. */
      .plain-fill-rows { margin: 4px 0 14px; }
      .plain-fill-row {
        display: flex;
        align-items: flex-end;
        gap: 6px;
        padding: 3px 0;
      }
      .plain-fill-row .inline-fill-label { font-weight: 600; }
      .plain-fill-row .inline-fill-line {
        border-bottom: 1px solid #111;
        min-height: 22px;
      }
      /* Ruled writing lines for free-response questions, in place of literal underscore text. */
      .answer-lines { margin: 4px 0 12px; }
      .answer-line {
        border-bottom: 1px solid #333;
        height: 26px;
        margin-bottom: 8px;
      }
      .answer-line:last-child { margin-bottom: 0; }
      /* Dense intake form: tighter vertical rhythm and a slightly smaller font
         so it reliably fits in exactly two pages. */
      .intake-compact { font-size: 12.5px; line-height: 1.3; }
      .intake-compact h1 { margin-bottom: 10px; }
      .intake-compact p { margin: 0 0 5px; }
      .intake-compact table { margin: 6px 0 10px; }
      .intake-compact th, .intake-compact td { padding: 5px 7px; }
      .intake-compact .plain-fill-rows { margin: 2px 0 10px; }
      .intake-compact .plain-fill-row { padding: 2px 0; }
      .intake-compact .plain-fill-row .inline-fill-line { min-height: 18px; }
      .intake-compact .form-blank { height: 20px; }
      .intake-compact .answer-lines { margin: 2px 0 8px; }
      .intake-compact .answer-line { height: 20px; margin-bottom: 6px; }
      /* Compact so the roster (with its handwritten blank rows) fits on one page. */
      .packet-staff-table { font-size: 11px; }
      .packet-staff-table th, .packet-staff-table td { padding: 4px 6px; }
      .packet-staff-table th { background: #f3f4f6; font-weight: 700; }
      .deny-col, .deny-cell { width: 0.85in; text-align: center; white-space: nowrap; }
      .deny-label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
      .deny-box { font-size: 13px; line-height: 1; }
      /* Signature callouts: thin gray box + faint hatch — noticeable without
         being a heavy black block, so it stays obvious in B&W without looking
         like an error/warning callout. */
      .signature-box {
        margin: 18px 0 10px;
        border: 1px solid #9ca3af;
        border-radius: 4px;
        padding: 10px 12px 12px;
        background: repeating-linear-gradient(
          -45deg,
          #ffffff,
          #ffffff 7px,
          #f3f4f6 7px,
          #f3f4f6 14px
        );
        page-break-inside: avoid;
      }
      .signature-box-title {
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        text-align: left;
        color: #4b5563;
        margin: 0 0 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid #9ca3af;
      }
      .sig-row {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        margin: 16px 0 0;
      }
      .sig-label {
        flex: 0 0 auto;
        white-space: nowrap;
        font-weight: 700;
        font-size: 12.5px;
      }
      .sig-line {
        flex: 1 1 auto;
        border-bottom: 1.75px solid #000;
        min-height: 22px;
      }
      .sig-date-label {
        flex: 0 0 auto;
        font-weight: 700;
        font-size: 12.5px;
        white-space: nowrap;
      }
      .sig-date-line {
        flex: 0 0 1.35in;
        border-bottom: 1.75px solid #000;
        min-height: 22px;
      }
      /* Fallback for older templates that still use <p class="signature-line"> */
      .packet-body p.signature-line {
        margin-top: 18px;
        margin-bottom: 10px;
        padding: 10px 12px;
        border: 1px solid #9ca3af;
        border-radius: 4px;
        background: repeating-linear-gradient(
          -45deg,
          #ffffff,
          #ffffff 7px,
          #f3f4f6 7px,
          #f3f4f6 14px
        );
        font-weight: 700;
        page-break-inside: avoid;
      }
      /* High-contrast banner: pages after the acknowledgement are keep-copies. */
      .packet-records-banner {
        border: 3px solid #000;
        padding: 10px 12px;
        margin: 0 0 14px;
        background: #fff;
        page-break-inside: avoid;
      }
      .packet-records-banner-title {
        font-weight: 800;
        font-size: 15px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        text-align: center;
        margin: 0 0 8px;
        padding-bottom: 6px;
        border-bottom: 2px solid #000;
      }
      /* Muted informational note, not part of the legal/consent text itself. */
      .packet-note-gray { color: #374151; margin: 0; }
      /* Dense legal prose (Mental Health Professional Info / Disclosure Part 2,
         HIPAA) shrinks back down since it runs long; provider cards below keep
         their own fixed font sizes so "Your Care Team" is unaffected. */
      .packet-dense { font-size: 11.5px; line-height: 1.4; }
      .packet-dense p, .packet-dense li { margin: 0 0 7px; }
      .packet-dense h2 { font-size: 19px; }
      .packet-dense h3, .packet-dense .packet-subhead { font-size: 15px; margin: 14px 0 8px; }
      /* Client Rights (Disclosure Part 1): between prior too-large and 9px too-small. */
      .packet-dense-tight { font-size: 10px; line-height: 1.38; }
      .packet-dense-tight p, .packet-dense-tight li { margin: 0 0 5.5px; }
      .packet-dense-tight h2 { font-size: 16px; margin: 0 0 4px; }
      .packet-dense-tight h3, .packet-dense-tight .packet-subhead { font-size: 12px; margin: 10px 0 6px; }
      /* "Potential Care Team Members" (non-primary providers) read smaller than
         "Your Care Team", whose card sizes are left untouched. */
      .packet-potential-team .packet-provider-name { font-size: 11.5px; }
      .packet-potential-team .packet-provider-line { font-size: 10px; }
      .packet-potential-team .packet-section-title { font-size: 15px; }
      .packet-potential-team .packet-subhead { font-size: 12.5px; }
      .packet-provider {
        margin: 0 0 14px;
        padding: 0 0 10px;
        border-bottom: 1px solid #d1d5db;
        page-break-inside: avoid;
      }
      .packet-provider:last-child { border-bottom: 0; }
      .packet-provider-name {
        font-weight: 700;
        font-size: 14px;
        margin: 0 0 2px;
      }
      .packet-provider-line {
        margin: 0;
        line-height: 1.3;
        font-size: 12.5px;
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
          padding: 0.5in;
        }
        .packet-cover {
          padding: 0.5in;
        }
        .packet-watermark { display: none; }
      }
  `;
}

function buildPacketBodyContentHtml(packetContext = {}) {
  const schoolName = packetContext?.organization?.name || '';
  const schoolAddress = packetContext?.organization?.address || '';

  const bodyLocale = packetContext?.locale || 'en';
  const staffTableHtml = buildSchoolStaffTableHtml(packetContext?.staffRows || [], bodyLocale);
  const disclosureHtml = buildDisclosureCareTeamHtml(packetContext?.providers || [], bodyLocale);
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

  return `
    <div class="packet-body-wrap">
      ${watermark ? `<img class="packet-watermark" src="${watermark}" alt="" />` : ''}
      <div class="packet-body">
        ${bodyHtml}
      </div>
    </div>
  `;
}

function wrapPacketHtmlDocument(schoolName, innerHtml) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(schoolName || 'School')} School Packet</title>
    <style>
${buildPacketStyleBlock()}
    </style>
  </head>
  <body>
    ${innerHtml}
  </body>
</html>`;
}

export function buildSchoolPrintablePacketHtml(packetContext = {}) {
  const schoolName = packetContext?.organization?.name || '';
  return wrapPacketHtmlDocument(
    schoolName,
    `${buildCoverPageHtml(packetContext)}${buildPacketBodyContentHtml(packetContext)}`
  );
}

// Cover is rendered as its own single-page PDF: an exact copy of page 1 plus the
// dynamic school title — no watermark, no header/footer chrome, no page number.
function buildSchoolPrintablePacketCoverDocument(packetContext = {}) {
  const schoolName = packetContext?.organization?.name || '';
  return wrapPacketHtmlDocument(schoolName, buildCoverPageHtml(packetContext));
}

// Content pages are rendered separately so the header logo, footer, page
// numbers, and watermark only ever apply to these pages — never the cover.
function buildSchoolPrintablePacketBodyDocument(packetContext = {}) {
  const schoolName = packetContext?.organization?.name || '';
  return wrapPacketHtmlDocument(schoolName, buildPacketBodyContentHtml(packetContext));
}

function buildPdfChromeTemplates(packetContext = {}) {
  const packetVersionLabel = packetContext?.packetVersionLabel || SCHOOL_PRINTABLE_PACKET_VERSION;
  const logo = headerLogoDataUrl();
  const footerMark = footerMarkDataUrl();
  // Header logo back to its ~50%-of-original size now that the 0.75in top
  // margin gives it comfortable clearance above body content.
  const headerTemplate = `
    <div style="width:100%; box-sizing:border-box; margin:0; padding:0 0.5in; text-align:center; line-height:0;">
      <img src="${logo}" style="height:46px; width:auto; max-width:3.5in; object-fit:contain; vertical-align:top;" />
    </div>
  `;
  // Bottom-left: ITSCOpnginvisiblebackgroundBW. Center: Version only. Right: page.
  const footerTemplate = `
    <div style="width:100%; box-sizing:border-box; padding:0 0.5in; color:#111; display:flex; justify-content:space-between; align-items:center; font-size:10px;">
      <div style="width:28%; text-align:left;">
        ${footerMark ? `<img src="${footerMark}" style="height:18px; width:auto; max-width:1in; object-fit:contain;" />` : ''}
      </div>
      <div style="width:44%; text-align:center; font-family: Impact, Anton, Arial Black, sans-serif; letter-spacing:0.02em;">
        Version ${escapeHtml(String(packetVersionLabel))}
      </div>
      <div style="width:28%; text-align:right; font-family: Impact, Anton, Arial Black, sans-serif;">
        PAGE <span class="pageNumber"></span>
      </div>
    </div>
  `;
  return { headerTemplate, footerTemplate };
}

const COVER_PDF_MARGIN = { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' };
// Body pages get a taller 0.75in top margin (sides/bottom stay 0.5in) so the
// header logo has clearance above the content.
const BODY_PDF_MARGIN = { top: '0.75in', right: '0.5in', bottom: '0.5in', left: '0.5in' };

export async function generateSchoolPrintablePacketPdf(packetContext) {
  const coverHtml = buildSchoolPrintablePacketCoverDocument(packetContext);
  const bodyHtml = buildSchoolPrintablePacketBodyDocument(packetContext);
  const { headerTemplate, footerTemplate } = buildPdfChromeTemplates(packetContext);

  // Cover is generated as its own PDF with no header/footer chrome so it is an
  // exact, unmodified copy of page 1 — no logo duplication, no page number.
  const coverPdfBytes = await DocumentSigningService.convertHTMLToPDF(coverHtml, {
    printBackground: true,
    margin: COVER_PDF_MARGIN,
    preferCSSPageSize: false,
    displayHeaderFooter: false,
    disableFallback: true
  });

  // Content pages get the header logo, footer, page numbers, and watermark.
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
    title: `${String(organization.name || 'School').trim()} — School Packet (Smart)`,
    updatedAt: template?.updated_at
      ? new Date(template.updated_at).toISOString()
      : new Date().toISOString()
  };
}

export async function getSchoolPacketTemplateForOrganization(organizationId, { locale = 'en' } = {}) {
  const orgId = Number(organizationId || 0);
  const loc = normalizeLocale(locale);
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
  const template = await SchoolPacketTemplate.getOrCreateForAgency(agencyId, { locale: loc });
  return {
    agencyId,
    locale: loc,
    html_content: String(template?.html_content || defaultHtmlForLocale(loc) || DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML),
    version: Number(template?.version || 1),
    updatedAt: template?.updated_at ? new Date(template.updated_at).toISOString() : null,
    updatedByUserId: template?.updated_by_user_id || null
  };
}

export { buildPacketStyleBlock, buildPdfChromeTemplates, watermarkDataUrl };

export async function saveSchoolPacketTemplateForOrganization({
  organizationId,
  htmlContent,
  actorUserId = null,
  locale = 'en'
}) {
  const orgId = Number(organizationId || 0);
  const loc = normalizeLocale(locale);
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
    actorUserId,
    locale: loc
  });
  return {
    agencyId,
    locale: loc,
    html_content: String(saved?.html_content || ''),
    version: Number(saved?.version || 1),
    updatedAt: saved?.updated_at ? new Date(saved.updated_at).toISOString() : null,
    updatedByUserId: saved?.updated_by_user_id || null
  };
}
