import { safeMarketingHref } from './marketingPageQuality';
import { mergeJoinLayout, restoreJoinWelcomeCopy } from './joinLandingTemplate';

export const JOIN_ELEMENTS = [
  { id: 'welcome', label: 'Welcome heading', group: 'main', fields: ['welcomeTitle'], size: 'welcome' },
  { id: 'glad', label: 'Welcome note', group: 'main', fields: ['welcomeGlad'], size: 'glad' },
  { id: 'lead', label: 'Introduction', group: 'main', fields: ['welcomeLead'], size: 'lead' },
  { id: 'cards', label: 'Intake choices', group: 'main', fields: [], size: 'cardsWidth' },
  { id: 'quick', label: 'Interest form card', group: 'cards', fields: ['quickTitle', 'quickTagline', 'quickDescription', 'quickDuration', 'quickCta', 'quickFooter'], bullets: 'quickBullets', size: 'cardTitle' },
  { id: 'full', label: 'Enrollment card', group: 'cards', fields: ['fullTitle', 'fullTagline', 'fullDescription', 'fullDuration', 'fullCta', 'fullFooter'], bullets: 'fullBullets', size: 'cardTitle' },
  { id: 'logo', label: 'Organization logo', group: 'rail', fields: [], size: 'logoWidth' },
  { id: 'tagline', label: 'Brand tagline', group: 'rail', fields: ['sidebarTagline'], size: 'tagline' },
  { id: 'script', label: 'Brand script', group: 'rail', fields: ['sidebarScript'], size: 'script' },
  { id: 'values', label: 'Values', group: 'rail', fields: ['value1', 'value2', 'value3'], size: 'values' },
  { id: 'help', label: 'Support card', group: 'rail', fields: ['helpTitle', 'helpBody', 'sendMessage'], size: 'helpWidth' },
  { id: 'footer', label: 'Footer', group: 'footer', fields: ['slogan'] }
];
export const JOIN_FIELD_LABELS = {
  welcomeTitle: 'Heading', welcomeGlad: 'Welcome note', welcomeLead: 'Introduction', sidebarTagline: 'Tagline', sidebarScript: 'Script line',
  value1: 'First value', value2: 'Second value', value3: 'Third value', helpTitle: 'Support heading', helpBody: 'Support description', sendMessage: 'Support button', slogan: 'Footer message'
};
export const JOIN_DEVICES = [{ id: 'desktop', label: 'Desktop', width: 1440, height: 900 }, { id: 'tablet', label: 'Tablet', width: 1024, height: 900 }, { id: 'mobile', label: 'Mobile', width: 390, height: 844 }];
export const joinDeviceForWidth = width => width <= 860 ? 'mobile' : width <= 1100 ? 'tablet' : 'desktop';
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const limit = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export const JOIN_SIZE_LIMITS = { welcome: [.8, 7], glad: [.7, 3], lead: [.7, 2.5], cardTitle: [.8, 3], logoWidth: [48, 360], tagline: [.5, 1.6], script: [.8, 4], values: [.65, 1.6], cardsWidth: [260, 1200], helpWidth: [0, 360] };
export function safeJoinImage(value) {
  const s = String(value || '').trim();
  return /^(https?:\/\/|\/(?!\/))[^\s\\]*$/i.test(s) ? s : '';
}
export function joinDesignElements(design) {
  const seen = new Set(JOIN_ELEMENTS.map(e => e.id));
  const custom = (Array.isArray(design?.elements) ? design.elements : []).slice(0, 30).filter(e => {
    if (!e || !/^custom_[a-z0-9_-]+$/i.test(e.id) || seen.has(e.id) || !['text', 'image', 'link'].includes(e.type)) return false;
    seen.add(e.id); return true;
  }).map(e => ({ id: e.id, type: e.type, label: String(e.label || `${e.type} section`).slice(0, 100), group: e.group === 'rail' ? 'rail' : 'main', ...(e.type === 'image' ? { size: e.id + 'Width' } : {}), fields: (e.type === 'text' ? ['Title', 'Body'] : e.type === 'image' ? ['Url', 'Alt'] : ['Label', 'Href']).map(suffix => e.id + suffix) }));
  return [...JOIN_ELEMENTS, ...custom];
}
export function createJoinDesign(layout) {
  const legacy = mergeJoinLayout(layout);
  return {
    version: 1, elements: [], backgroundUrl: '', referenceImageUrl: '',
    views: Object.fromEntries(JOIN_DEVICES.map(({ id }) => [id, {
      sizes: { ...legacy.sizes, ...(id === 'desktop' ? {} : { welcome: id === 'mobile' ? 2.6 : 3.2, script: 1.55, logoWidth: 140, cardsWidth: 860, helpWidth: 0 }) },
      align: { ...Object.fromEntries(JOIN_ELEMENTS.map(e => [e.id, 'left'])), ...legacy.align },
      hidden: { ...Object.fromEntries(JOIN_ELEMENTS.map(e => [e.id, false])), ...legacy.hidden },
      positions: Object.fromEntries(JOIN_ELEMENTS.map(e => [e.id, id === 'desktop' && e.id !== 'help' ? { ...(legacy.positions[e.id] || { x: 0, y: 0 }) } : { x: 0, y: 0 }])),
      order: { main: ['welcome', 'glad', 'lead', 'cards'], rail: ['logo', 'tagline', 'script', 'values', 'help'], cards: ['quick', 'full'] },
      fonts: { ...legacy.fonts }, copy: {}, backgroundUrl: '', backgroundX: 50, backgroundY: 50,
      backgroundWash: 25, headingColor: '#123c6d', primaryColor: '#276345', secondaryColor: '#205493', surfaceColor: '#ffffff',
      padding: id === 'desktop' ? 32 : 20, gap: 20, railPlacement: 'after', footerStyle: legacy.footerStyle
    }]))
  };
}
export function normalizeJoinDesign(layout) {
  const base = createJoinDesign(layout);
  const saved = object(layout?.design);
  const elements = joinDesignElements(saved);
  const result = { ...base, elements: elements.filter(e => e.type).map(({ id, type, label, group }) => ({ id, type, label, group })), backgroundUrl: safeJoinImage(saved.backgroundUrl), referenceImageUrl: safeJoinImage(saved.referenceImageUrl) };
  for (const { id } of JOIN_DEVICES) {
    const src = object(saved.views?.[id]); const def = base.views[id];
    for (const e of elements.filter(e => e.type)) { def.order[e.group].push(e.id); def.positions[e.id] = { x: 0, y: 0 }; def.hidden[e.id] = false; def.align[e.id] = 'left'; if (e.size) def.sizes[e.size] = 600; }
    const view = { ...def, sizes: { ...def.sizes }, hidden: { ...def.hidden }, align: { ...def.align }, positions: clone(def.positions), order: clone(def.order), fonts: { ...def.fonts, ...object(src.fonts) }, copy: {} };
    for (const [key, range] of Object.entries(JOIN_SIZE_LIMITS)) if (src.sizes?.[key] != null) view.sizes[key] = limit(src.sizes[key], def.sizes[key], ...range);
    for (const e of elements) {
      if (e.type === 'image') view.sizes[e.size] = limit(src.sizes?.[e.size] ?? 600, 600, 80, 1200);
      if (typeof src.hidden?.[e.id] === 'boolean') view.hidden[e.id] = src.hidden[e.id];
      if (['left', 'center', 'right'].includes(src.align?.[e.id])) view.align[e.id] = src.align[e.id];
      if (src.positions?.[e.id]) view.positions[e.id] = { x: limit(src.positions[e.id].x, 0, -200, 200), y: limit(src.positions[e.id].y, 0, -200, 200) };
      for (const field of e.fields) if (typeof src.copy?.[field] === 'string') view.copy[field] = src.copy[field];
      if (e.bullets && Array.isArray(src.copy?.[e.bullets])) view.copy[e.bullets] = src.copy[e.bullets].map(String);
    }
    // The intake choices container itself must remain available.
    view.hidden.cards = false;
    for (const group of ['main', 'rail', 'cards']) view.order[group] = [...new Set([...(Array.isArray(src.order?.[group]) ? src.order[group] : []), ...def.order[group]])].filter(key => def.order[group].includes(key));
    view.backgroundUrl = safeJoinImage(src.backgroundUrl);
    view.backgroundWash = limit(src.backgroundWash ?? 25, 25, 0, 90);
    for (const key of ['headingColor', 'primaryColor', 'secondaryColor', 'surfaceColor']) if (/^#[a-f0-9]{6}$/i.test(src[key])) view[key] = src[key];
    view.backgroundX = limit(src.backgroundX ?? 50, 50, 0, 100); view.backgroundY = limit(src.backgroundY ?? 50, 50, 0, 100);
    view.padding = limit(src.padding ?? def.padding, def.padding, 12, 80); view.gap = limit(src.gap ?? 20, 20, 8, 64);
    view.railPlacement = src.railPlacement === 'before' ? 'before' : 'after';
    view.footerStyle = ['hidden', 'frost', 'white', 'clear', 'dark'].includes(src.footerStyle) ? src.footerStyle : def.footerStyle;
    result.views[id] = view;
  }
  return result;
}
export function resolveJoinPresentation(config, width) {
  const original = config?.copy || {};
  const copy = restoreJoinWelcomeCopy(original, config?.agency?.name);
  const design = normalizeJoinDesign(original.layout);
  const device = joinDeviceForWidth(width);
  const view = design.views[device];
  return { copy: { ...copy, ...view.copy }, design, view, device };
}
export function joinCards(copy, quick = {}, full = {}) {
  return Object.fromEntries([['quick', quick], ['full', full]].map(([key, fallback]) => [key, {
    ...fallback,
    ...Object.fromEntries(['title', 'tagline', 'description', 'duration', 'bullets', 'cta', 'footer'].map(field => {
      const savedKey = key + field[0].toUpperCase() + field.slice(1);
      return [field, copy[savedKey] ?? fallback[field] ?? (field === 'bullets' ? [] : '')];
    }))
  }]));
}
export function joinDesignIssues(copy, fullEnabled) {
  const design = normalizeJoinDesign(copy.layout); const issues = [];
  for (const { id, label } of JOIN_DEVICES) {
    const view = design.views[id]; const c = { ...copy, ...view.copy };
    const quickVisible = !view.hidden.quick;
    const fullVisible = !view.hidden.full && fullEnabled;
    if (!quickVisible && !fullVisible) issues.push(`${label}: keep at least one available intake choice visible.`);
    for (const key of ['quick', 'full']) if ((key === 'quick' ? quickVisible : fullVisible) && (!String(c[`${key}Title`] || '').trim() || !String(c[`${key}Cta`] || '').trim())) issues.push(`${label}: ${key === 'quick' ? 'interest form' : 'enrollment'} needs a title and button label.`);
    if (!view.hidden.welcome && !String(c.welcomeTitle || '').trim()) issues.push(`${label}: add a welcome heading or hide the empty heading element.`);
    const rawUrl = copy.layout?.design?.views?.[id]?.backgroundUrl;
    if (rawUrl && !safeJoinImage(rawUrl)) issues.push(`${label}: background needs a valid image URL.`);
    for (const element of joinDesignElements(design).filter(e => e.type && !view.hidden[e.id])) {
      if (element.type === 'link' && (!String(c[element.id + 'Label'] || '').trim() || !safeMarketingHref(c[element.id + 'Href']))) issues.push(`${label}: ${element.label} needs link text and a valid destination.`);
      if (element.type === 'image' && (!safeJoinImage(c[element.id + 'Url']) || !String(c[element.id + 'Alt'] || '').trim())) issues.push(`${label}: ${element.label} needs an image URL and description.`);
      if (element.type === 'text' && !String(c[element.id + 'Title'] || c[element.id + 'Body'] || '').trim()) issues.push(`${label}: add text to ${element.label} or remove it.`);
    }
  }
  return issues;
}
