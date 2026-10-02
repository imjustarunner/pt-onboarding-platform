// Avery 35702: US Letter, 3 × 3 cards. Positions match Avery's sheet diagram:
// https://img.avery.com/web/templates/line-art/35702
export const AVERY_35702 = Object.freeze({ width: 8.5, height: 11, card: 2.5, bleed: 0.0625, left: 0.25, top: 0.875, pitchX: 2.75, pitchY: 3.375 });
export const CARD_FIELDS = ['name', 'title', 'credentials', 'email', 'phone', 'extension', 'website', 'address'];
const text = (value) => String(value ?? '').trim();
const extension = (value) => text(value).replace(/^(?:extension|ext\.?|x)\s*[:#.-]?\s*/i, '');
const shortZip = (value) => text(value).replace(/\b(\d{5})-\d{4}$/, '$1');
const escape = (value) => text(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(text(value)) ? value : fallback;
export const safeLogo = (value) => /^(data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+|https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']+)$/i.test(text(value)) ? text(value) : '';


export function safeLogoCrop(value) {
  const parts = text(value).split(/\s+/).map(Number);
  if (parts.length !== 6 || parts.some(v => !Number.isFinite(v) || v < 0 || v > 10000)) return '';
  const [x,y,w,h,iw,ih] = parts;
  return w > 0 && h > 0 && iw > 0 && ih > 0 && x+w <= iw && y+h <= ih ? parts.join(' ') : '';
}
// Frame one mark from a supplied brand sheet without changing the source artwork.
export function cardLogoMarkup(card, x, y, width, height, attributes = '') {
  const logo = safeLogo(card.logo); if (!logo) return '';
  const crop = safeLogoCrop(card.logoCrop);
  if (!crop) return `<image ${attributes} href="${escape(logo)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
  const [cx,cy,cw,ch,iw,ih] = crop.split(' ').map(Number);
  const clipId = `card-logo-crop-${x}-${y}-${width}-${height}`;
  return `<svg ${attributes} x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${cx} ${cy} ${cw} ${ch}" preserveAspectRatio="xMidYMid meet" overflow="hidden"><defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"/></clipPath></defs><image href="${escape(logo)}" width="${iw}" height="${ih}" clip-path="url(#${clipId})"/></svg>`;
}

export function organizationCardDefaults(agency = {}, contact = {}) {
  const isItsco = String(agency.slug || '').toLowerCase() === 'itsco';
  const brand = {
    mh4kidz: { primary: '#ce6605' },
    nlu: { primary: '#092e58', accent: '#6cc3b7', logo: '/assets/business-cards/nlu-brand-options.png', logoCrop: '25 5 700 300 2172 724', watermarkLogo: '/assets/nlu/icon.png' },
    plottwistco: { primary: '#a71111', accent: '#000000' },
    tisi: { primary: '#13304e', accent: '#174b73', logo: '/assets/branding/innerstrength-mark.png' }
  }[String(agency.slug || '').toLowerCase()] || {};
  let colors = agency.color_palette || {};
  if (typeof colors === 'string') { try { colors = JSON.parse(colors); } catch { colors = {}; } }
  return {
    organization: text(agency.official_name || agency.name),
    primary: isItsco ? '#a1dce1' : safeColor(colors?.primary, '#a1dce1'), accent: isItsco ? '#b9d84e' : safeColor(colors?.secondary, '#b9d84e'),
    primaryText: isItsco ? '#ffffff' : 'auto', accentText: isItsco ? '#ffffff' : 'auto',
    qrUrl: '', backCaption: 'Explore our website',
    logo: '', logoCrop: '', watermarkLogo: '', website: text(agency.website_url) || text(contact.website?.display), phone: text(agency.phone_number) || text(contact.phone?.display),
    extension: extension(agency.phone_extension),
    address: [agency.street_address, [agency.city, agency.state].filter(Boolean).join(', ') + (agency.postal_code ? ` ${shortZip(agency.postal_code)}` : '')].filter(v => text(v)).join('\n'),
    ...brand
  };
}

export function assignedCardOffices(assignments, offices, agencyId) {
  const available = new Map(offices.filter(office => {
    const ids = office.agencyIds?.length ? office.agencyIds : [office.agency_id];
    return ids.some(id => String(id) === String(agencyId)) && ![false, 0, '0'].includes(office.is_active);
  }).map(office => [String(office.id), office]));
  return assignments.filter(a => ![false, 0, '0'].includes(a.isActive) && available.has(String(a.id))).map(a => {
    const office = available.get(String(a.id));
    return { id: String(a.id), name: text(office.name), primary: [true, 1, '1'].includes(a.isPrimary), address: organizationCardDefaults(office).address };
  });
}

export function employeeCardDefaults(user = {}, offices = [], contact = {}) {
  return {
    id: String(user.id), selected: false,
    name: [user.preferred_name || user.first_name, user.last_name].filter(Boolean).join(' '),
    title: text(user.agency_position) || text(user.title), credentials: text(user.credential || user.provider_credential),
    // Use the app's tenant-specific public contact identity, not a raw login email.
    email: text(contact.email) || text(user.work_email), phone: '', workLine: contact.workLine || null, extension: extension(user.work_phone_extension),
    website: '', address: '', offices,
    officeId: offices.find(office => office.primary)?.id || (offices.length === 1 ? offices[0].id : '')
  };
}

export function isCardEmployee(user, agencyId) {
  const ids = Array.isArray(user.agency_ids) ? user.agency_ids : text(user.agency_ids).split(',');
  return ids.some(id => String(id).trim() === String(agencyId))
    && ['super_admin', 'admin', 'assistant_admin', 'support', 'staff', 'provider', 'provider_plus', 'clinical_practice_assistant', 'supervisor', 'intern', 'intern_plus', 'facilitator', 'tutor', 'clinician', 'school_staff'].includes(user.role)
    && ![false, 0, '0'].includes(user.is_active)
    && ['', 'ACTIVE', 'ACTIVE_EMPLOYEE'].includes(text(user.status).toUpperCase());
}

export function resolveCard(person, organization) {
  const ownPhone = text(person.phone);
  const office = person.offices?.find(o => o.id === person.officeId);
  const defaultAddress = person.officeId === '__organization' || !Array.isArray(person.offices) ? organization.address : office?.address || '';
  return { ...organization, ...person, website: text(person.website) || organization.website,
    qrUrl: text(organization.qrUrl) || text(organization.website), backWebsite: organization.website,
    address: shortZip(text(person.address) || defaultAddress), phone: ownPhone || organization.phone,
    extension: extension(ownPhone ? person.extension : text(person.extension) || organization.extension) };
}

function lines(value, width, measure) {
  return text(value).split('\n').flatMap(paragraph => {
    const result = []; let rest = paragraph;
    while (measure(rest) > width) {
      let maxChars = 1;
      while (maxChars < rest.length && measure(rest.slice(0, maxChars + 1)) <= width) maxChars++;
      let at = Math.max(rest.lastIndexOf(' ', maxChars), rest.lastIndexOf('-', maxChars - 1) + 1);
      if (at < maxChars / 2) at = maxChars;
      result.push(rest.slice(0, at)); rest = rest.slice(at).trim();
    }
    if (rest) result.push(rest);
    return result;
  });
}

function textBlock(value, x, y, width, size, maxLines, color, weight, family, measureText) {
  const measure = value => measureText ? measureText(value, size, family, weight) : value.length * size * 0.46;
  let rows = lines(value, width, measure);
  // Reduce type to accommodate full text; the editor limits field lengths.
  while (rows.length > maxLines && size > 15) { size -= 1; rows = lines(value, width, measure); }
  const lineHeight = family === 'CardHeading' ? 1.08 : 1.18;
  return { size, lines: rows.length, bottom: y + Math.max(0, rows.length - 1) * size * lineHeight, markup: rows.map((row, i) => `<text x="${x}" y="${y + i * size * lineHeight}" font-family="${family}, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escape(row)}</text>`).join('') };
}

function singleLine(value, x, y, width, size, color, weight, family, measureText, field) {
  const content = text(value).replace(/\s+/g, ' ');
  const measured = measureText ? measureText(content, size, family, weight) : content.length * size * 0.6;
  const fittedSize = measured > width ? size * width / measured : size;
  return `<text data-card-field="${field}" x="${x}" y="${y}" font-family="${family}, sans-serif" font-size="${fittedSize}" font-weight="${weight}" fill="${color}">${escape(content)}</text>`;
}

function ink(background) {
  const rgb = background.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.36 ? '#163638' : '#ffffff';
}

// Vector contact marks stay crisp in previews and print without an icon font.
function contactIcon(kind, x, y, size, color = '#162f32') {
  const paths = {
    email: '<rect x="2" y="4" width="20" height="16" rx="1.5"/><path d="m3 5 9 7 9-7M3 19l6-6m12 6-6-6"/>',
    office: '<path d="M3 22h18M5 22V3h14v19M10 22v-5h4v5M8 7h1m6 0h1M8 11h1m6 0h1"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>',
    website: '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4.5" ry="10"/><path d="M2 12h20M4 6h16M4 18h16"/>',
    location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'
  };
  return `<g data-card-icon="${kind}" transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</g>`;
}

export function cardSvg(card, fonts = {}, bleedInches = 0, bottomBleedInches = bleedInches) {
  // Extend only the background outside the trim; content keeps its printed size.
  const bleed = bleedInches * 750 / AVERY_35702.card;
  const artworkSize = 750 + bleed * 2;
  const bottomBleed = bottomBleedInches * 750 / AVERY_35702.card;
  const artworkHeight = 750 + bleed + bottomBleed;
  const primary = safeColor(card.primary, '#a1dce1'), accent = safeColor(card.accent, '#b9d84e');
  const primaryInk = safeColor(card.primaryText, ink(primary)), accentInk = safeColor(card.accentText, ink(accent));
  const logo = safeLogo(card.logo);
  const watermark = safeLogo(card.watermarkLogo);
  const phone = text(card.phone) ? [text(card.phone), extension(card.extension) ? `ext. ${extension(card.extension)}` : ''].filter(Boolean).join(' ') : '';
  const block = (value, x, y, width, size, maxLines, color = '#162f32', heading = false) => textBlock(value, x, y, width, size, maxLines, color, heading ? 700 : 400, heading ? 'CardHeading' : 'CardBody', fonts.measure);
  const svgText = (...args) => block(...args).markup;
  const name = { bottom: 82, markup: singleLine(card.name, 35, 82, 320, 44, primaryInk, 700, 'CardHeading', fonts.measure, 'name') };
  const credentials = block(card.credentials, 35, name.bottom + 34, 320, 26, 1, primaryInk, true);
  const title = block(card.title, 35, (credentials.lines ? credentials.bottom : name.bottom) + 38, 320, 24, 3, primaryInk);
  const dividerY = (title.lines ? title.bottom : credentials.lines ? credentials.bottom : name.bottom) + 20;
  // Keep the identity centered alongside the logo after moving phones below.
  const topOffset = Math.max(0, 220 - (56 + dividerY) / 2);
  const displayEmail = text(card.email).replace(/@itsco\.health$/i, '@ITSCO.health');
  const workLine = card.workLine?.number && (card.workLine.canText || card.workLine.canCall) ? card.workLine : null;
  const workLabel = workLine?.canCall ? (workLine.canText ? 'Call / Text' : 'Call') : 'Text';
  const formatPhone = value => text(value).replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  const contactRows = [];
  let contactY = 470;
  const contactRow = (kind, value, field) => {
    if (!text(value)) return;
    contactRows.push(`<g data-card-contact="${field}">${contactIcon(kind, 35, contactY - 23, 28)}${singleLine(value, 76, contactY, 279, 26, '#162f32', 400, 'CardBody', fonts.measure, field)}</g>`);
    contactY += 58;
  };
  contactRow('office', phone, 'office-phone');
  if (workLine) contactRow('phone', `${formatPhone(workLine.number)} ${workLabel}`, 'work-phone');
  contactRow('email', displayEmail, 'email');
  contactRow('website', card.website, 'website');
  // Center the entire address group against the visible contact rows, including
  // the optional work line. Keep both groups safely inside the bottom panels.
  const address = block(shortZip(card.address), 423, 470, 292, 26, 6, accentInk);
  const contactCenter = contactRows.length ? (447 + contactY - 58) / 2 : 562.5;
  const addressOffset = Math.max(400 - 406, Math.min(715 - address.bottom, contactCenter - (406 + address.bottom) / 2));
  const fontFace = (value, family, weight) => /^data:font\/ttf;base64,[a-z0-9+/=]+$/i.test(value || '') ? `@font-face{font-family:${family};src:url('${value}') format('truetype');font-weight:${weight};}` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${artworkSize}" height="${artworkHeight}" viewBox="${-bleed} ${-bleed} ${artworkSize} ${artworkHeight}">
  <metadata>${escape(fonts.licenses || '')}</metadata>
  <style>${fontFace(fonts.heading, 'CardHeading', 700)}${fontFace(fonts.body, 'CardBody', 400)}</style>
  <rect x="${-bleed}" y="${-bleed}" width="${artworkSize}" height="${artworkHeight}" fill="#f6f7f4"/>
  <rect data-card-panel="name-color" x="${-bleed}" y="${-bleed}" width="${390 + bleed}" height="${375 + bleed}" fill="${primary}"/>
  <rect data-card-panel="address-color" x="390" y="375" width="${360 + bleed}" height="${375 + bottomBleed}" fill="${accent}"/>
  ${logo || watermark ? `${cardLogoMarkup(watermark ? {logo:watermark} : card, -65, 260, 880, 590, 'data-card-watermark="logo" opacity="0.08"')}<rect x="390" y="${-bleed}" width="${360 + bleed}" height="${375 + bleed}" fill="#f6f7f4"/>` : ''}
  <g>
    <g data-card-panel="identity" transform="translate(0 ${topOffset})">
    ${name.markup}
    ${credentials.markup}
    ${title.markup}
    <path d="M35 ${dividerY} H355" stroke="${accent}" stroke-width="3"/>
    </g>
    ${logo ? cardLogoMarkup(card, 416, 71, 308, 303, 'data-card-logo="primary"') : svgText(card.organization, 421, 155, 298, 38, 5)}
    ${contactRows.join('')}
    ${card.address ? `<g data-card-panel="address" transform="translate(0 ${addressOffset})">${contactIcon('location', 421, 406, 25, accentInk)}${svgText('OFFICE LOCATION', 460, 427, 255, 20, 1, accentInk, true)}${address.markup}</g>` : ''}
  </g></svg>`;
}

export const svgDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function cardPositions(offsetX = 0, offsetY = 0) {
  if (![offsetX, offsetY].every(n => Number.isFinite(n) && Math.abs(n) <= 0.125)) throw new Error('Alignment offsets must be between −0.125 and 0.125 inches.');
  const t = AVERY_35702;
  return Array.from({ length: 9 }, (_, i) => ({ x: t.left + (i % 3) * t.pitchX + offsetX, y: t.top + Math.floor(i / 3) * t.pitchY + offsetY }));
}

export function readCardDraft(raw, organizationId) {
  const draft = JSON.parse(raw);
  if (draft.version !== 1 || String(draft.organizationId) !== String(organizationId) || !Array.isArray(draft.people)) throw new Error('Choose the organization this draft belongs to before loading it.');
  const pick = (source, keys) => Object.fromEntries(keys.map(key => [key, text(source?.[key]).slice(0, ['logo', 'watermarkLogo'].includes(key) ? 6000000 : 500)]));
  const organization = pick(draft.organization, ['organization', 'logo', 'watermarkLogo', 'logoCrop', 'primary', 'accent', 'primaryText', 'accentText', 'qrUrl', 'backCaption', 'website', 'phone', 'extension', 'address']);
  organization.logo = safeLogo(organization.logo);
  organization.watermarkLogo = safeLogo(organization.watermarkLogo);
  organization.logoCrop = safeLogoCrop(organization.logoCrop);
  organization.primary = safeColor(organization.primary, '#a1dce1'); organization.accent = safeColor(organization.accent, '#b9d84e');
  for (const key of ['primaryText', 'accentText']) organization[key] = /^(auto|#[0-9a-f]{6})$/i.test(organization[key]) ? organization[key] : 'auto';
  return { organization, print: draft.print, people: draft.people.map(p => ({ ...pick(p, CARD_FIELDS), id: text(p.id), selected: p.selected === true, ...('officeId' in p ? { officeId: text(p.officeId) } : {}) })) };
}
