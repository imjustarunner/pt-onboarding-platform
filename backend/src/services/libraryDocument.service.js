import { readFileSync } from 'node:fs';
import sanitizeHtml from 'sanitize-html';
import LetterheadTemplate from '../models/LetterheadTemplate.model.js';
import Agency from '../models/Agency.model.js';
import StorageService from './storage.service.js';
import { resolvePacketBrandChrome } from './packetBrandChrome.service.js';

let comfortaaCss;
function printableBodyFontCss(brand) {
  if (brand.useItscoChrome) {
    comfortaaCss ??= `@font-face{font-family:Comfortaa;src:url('data:font/ttf;base64,${readFileSync(new URL('../assets/schoolPrintablePacket/fonts/Comfortaa-Variable.ttf', import.meta.url)).toString('base64')}');font-weight:300 700}`;
    return comfortaaCss;
  }
  return brand.montserratRegularDataUrl ? `@font-face{font-family:Montserrat;src:url('${brand.montserratRegularDataUrl}')} @font-face{font-family:Montserrat;font-weight:600 900;src:url('${brand.montserratSemiBoldDataUrl}')}` : '';
}

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A single allowlist for storage, copying and rendering. No active content or remote images.
export function sanitizeDocumentHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['p', 'div', 'span', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'label', 'input'],
    allowedAttributes: {
      '*': ['style'], a: ['href', 'title', 'target', 'rel'],
      div: ['class', 'data-type'], hr: ['class', 'data-type'],
      ul: ['data-type'], li: ['data-type', 'data-checked'],
      input: ['type', 'checked', 'disabled'], ol: ['start'],
      td: ['colspan', 'rowspan', 'colwidth'], th: ['colspan', 'rowspan', 'colwidth'],
      mark: ['data-color']
    },
    allowedClasses: { div: ['page-break'], hr: ['page-break'] },
    allowedStyles: { '*': {
      'text-align': [/^(left|center|right|justify)$/],
      'color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
      'font-size': [/^(1[0-9]|2[0-9]|3[0-6]|[8-9])(pt|px)$/],
      'font-family': [/^[a-z ,'-]+$/i],
      'font-weight': [/^(bold|normal|[1-9]00)$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^(underline|line-through|none)$/],
      'width': [/^\d+(px|pt|%)$/],
      'break-after': [/^page$/], 'page-break-after': [/^always$/]
    } },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attrs) => ({ tagName, attribs: { ...attrs, target: '_blank', rel: 'noopener noreferrer' } }),
      input: (tagName, attrs) => ({ tagName, attribs: { type: 'checkbox', disabled: '', ...(Object.hasOwn(attrs, 'checked') ? { checked: '' } : {}) } })
    }
  });
}

export function documentError(message, status = 400) {
  return Object.assign(new Error(message), { status, statusCode: status });
}

export function sanitizeLetterheadHtml(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: { '*': ['style', 'class'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['data'], allowedSchemesByTag: { img: ['data'] }, allowProtocolRelative: false,
    allowedStyles: { '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'font-family': [/^[a-z ,'-]+$/i], 'font-size': [/^[\d.]+(px|pt)$/],
      'font-weight': [/^(normal|bold|[1-9]00)$/],
      color: [/^#[0-9a-f]{3,8}$/i, /^[a-z]+$/i],
      width: [/^[\d.]+(px|pt|in|%)$/, /^auto$/], height: [/^[\d.]+(px|pt|in|%)$/, /^auto$/],
      'max-width': [/^[\d.]+(px|pt|in|%)$/], 'object-fit': [/^contain$/],
      display: [/^(block|inline|inline-block|flex)$/],
      padding: [/^[\d.\s]+(px|pt|in|%)$/], margin: [/^[\d.\s]+(px|pt|in|%)$/]
    } },
    transformTags: { img: (tagName, attrs) => ({ tagName, attribs: { ...attrs, src: /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(attrs.src || '') ? attrs.src : '' } }) }
  });
}

export async function validateDocumentBranding({ agencyId, organizationId = null, brandingMode = 'plain', letterheadTemplateId = null }) {
  if (!['plain', 'organization', 'letterhead'].includes(brandingMode)) throw documentError('Choose a valid letterhead option');
  if (brandingMode !== 'letterhead') return null;
  const id = Number(letterheadTemplateId);
  if (!Number.isSafeInteger(id) || id <= 0) throw documentError('Choose a letterhead');
  const lh = await LetterheadTemplate.findById(id);
  if (!lh || !lh.is_active || (lh.agency_id != null && Number(lh.agency_id) !== Number(agencyId)) ||
      (lh.organization_id != null && Number(lh.organization_id) !== Number(organizationId))) {
    throw documentError('This letterhead is not available for this document');
  }
  return lh;
}

export async function resolveDocumentLetterhead(document) {
  const mode = document.brandingMode || (document.letterheadTemplateId ? 'letterhead' : 'plain');
  const base = { name: 'Plain paper', pageSize: 'letter', orientation: 'portrait', marginTop: 54, marginRight: 54, marginBottom: 54, marginLeft: 54, headerHeight: 0, footerHeight: 0, headerHtml: '', footerHtml: '', css: '', fontFamily: 'Arial, Helvetica, sans-serif', watermark: null };
  if (mode === 'plain') return base;
  if (mode === 'organization') {
    const agency = await Agency.findById(document.agencyId);
    const brand = await resolvePacketBrandChrome(agency || {});
    const logo = brand.headerImageDataUrl || brand.headerLogoDataUrl;
    return { ...base, name: `${agency?.name || 'Organization'} · Printable pages`,
      headerHeight: 54, footerHeight: 30, fontFamily: brand.bodyFontFamily,
      headerHtml: logo ? `<img src="${logo}" style="max-width:100%;height:46px;object-fit:contain" alt=""/>` : '',
      footerHtml: brand.footerMarkDataUrl ? `<img src="${brand.footerMarkDataUrl}" style="max-width:96px;height:20px;object-fit:contain" alt=""/>` : '',
      watermark: brand.watermarkDataUrl,
      css: printableBodyFontCss(brand)
    };
  }
  const lh = await validateDocumentBranding({ ...document, brandingMode: mode });
  let headerHtml = lh.header_html || '';
  if (lh.file_path) {
    const buffer = await StorageService.readObjectBuffer(lh.file_path);
    const mime = lh.template_type === 'svg' ? 'image/svg+xml' : 'image/png';
    headerHtml = `<img src="data:${mime};base64,${buffer.toString('base64')}" style="width:100%;height:100%;object-fit:contain" alt=""/>`;
  }
  const dimension = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(240, Number(value))) : fallback;
  return { ...base, name: lh.name, pageSize: lh.page_size === 'a4' ? 'a4' : 'letter', orientation: lh.orientation === 'landscape' ? 'landscape' : 'portrait',
    marginTop: dimension(lh.margin_top, 54), marginRight: dimension(lh.margin_right, 54), marginBottom: dimension(lh.margin_bottom, 54), marginLeft: dimension(lh.margin_left, 54),
    headerHeight: dimension(lh.header_height, 54), footerHeight: dimension(lh.footer_height, 30), headerHtml: sanitizeLetterheadHtml(headerHtml), footerHtml: sanitizeLetterheadHtml(lh.footer_html), css: lh.css_content || '' };
}

export function buildDocumentRender(document, letterhead, { includeWatermark = true } = {}) {
  const lh = letterhead;
  const top = Math.max(lh.marginTop, lh.headerHeight + 18);
  const bottom = Math.max(lh.marginBottom, lh.footerHeight + 18);
  const size = lh.pageSize === 'a4' ? [595.28, 841.89] : [612, 792];
  if (lh.orientation === 'landscape') size.reverse();
  // CSP also protects the PDF renderer from requests embedded in legacy letterhead HTML/CSS.
  const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";
  const css = `body{font-family:${lh.fontFamily};font-size:11pt;line-height:1.55;color:#172033;overflow-wrap:anywhere} p{margin:0 0 10pt} h1,h2,h3{break-after:avoid} table{border-collapse:collapse;width:100%;table-layout:fixed} td,th{border:1px solid #b7bec9;padding:7pt;vertical-align:top} th{background:#f1f5f9} blockquote{border-left:3px solid #cbd5e1;padding-left:12pt;margin-left:0} .page-break,[data-type="page-break"]{break-after:page;page-break-after:always} ul[data-type="taskList"]{list-style:none;padding-left:0} li[data-type="taskItem"]{display:flex;gap:8px} li[data-type="taskItem"]>div{flex:1} input{accent-color:#334155} mark{background:#fef08a} pre{white-space:pre-wrap} .watermark{position:fixed;inset:25% 20%;width:60%;height:50%;object-fit:contain;opacity:.055;z-index:-1} ${lh.css}`;
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${escapeHtml(document.name)}</title><style>${css.replace(/<\/style/gi, '')}</style>`;
  const body = `${includeWatermark && lh.watermark ? `<img class="watermark" src="${lh.watermark}" alt="">` : ''}<main>${sanitizeDocumentHtml(document.bodyHtml)}</main>`;
  const chrome = (html, height) => `<div style="width:100%;font-size:10pt;box-sizing:border-box;padding:0 ${lh.marginRight}pt 0 ${lh.marginLeft}pt"><div style="height:${height}pt;overflow:hidden">${html}</div></div>`;
  return {
    html: `<!doctype html><html><head>${head}</head><body>${body}</body></html>`,
    options: { width: `${size[0] / 72}in`, height: `${size[1] / 72}in`, disableFallback: true, margin: { top: `${top / 72}in`, right: `${lh.marginRight / 72}in`, bottom: `${bottom / 72}in`, left: `${lh.marginLeft / 72}in` }, displayHeaderFooter: true,
      headerTemplate: chrome(lh.headerHtml, lh.headerHeight),
      footerTemplate: chrome(`<div style="display:flex;align-items:center;gap:12pt"><div style="flex:1;min-width:0">${lh.footerHtml}</div><span style="flex-shrink:0;font:9pt Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`, Math.max(18, lh.footerHeight)) }
  };
}
