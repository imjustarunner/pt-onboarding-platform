/**
 * Shared careers_page_json sanitizer used by hiring + public intake controllers.
 */

const compactText = (value, max = 240) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
};

const normalizeNavStyle = (style) => {
  const s = String(style || 'link').trim().toLowerCase();
  return s === 'button' ? 'button' : 'link';
};

const normalizeNavAction = (action) => {
  const a = String(action || '').trim().toLowerCase();
  return ['why', 'impact', 'jobs', 'link'].includes(a) ? a : '';
};

const normalizeItems = (items, maxItems) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const title = compactText(item.title, 80);
      const body = compactText(item.body || item.description, 220);
      if (!title && !body) return null;
      return {
        icon: compactText(item.icon, 32),
        title,
        body,
        value: compactText(item.value, 40)
      };
    })
    .filter(Boolean)
    .slice(0, maxItems);
};

const normalizeGrowthPoints = (points) => {
  if (!Array.isArray(points)) return [];
  return points
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const label = compactText(p.label || p.year, 24);
      const value = Number(p.value);
      if (!label || !Number.isFinite(value)) return null;
      return { label, value: Math.max(0, Math.round(value)) };
    })
    .filter(Boolean)
    .slice(0, 8);
};

const sanitizeWhyModal = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cards = normalizeItems(raw.cards, 6).map(({ icon, title, body }) => ({ icon, title, body }));
  const out = {
    enabled: raw.enabled !== false,
    title: compactText(raw.title, 120),
    subtitle: compactText(raw.subtitle, 240),
    icon: compactText(raw.icon, 32),
    cards,
    ctaText: compactText(raw.ctaText || raw.cta_text, 80),
    ctaHref: compactText(raw.ctaHref || raw.cta_href, 512),
    ctaAction: normalizeNavAction(raw.ctaAction || raw.cta_action)
  };
  if (!out.title && !out.subtitle && !out.cards.length) return null;
  return out;
};

const sanitizeImpactModal = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const stats = Array.isArray(raw.stats)
    ? raw.stats
        .map((s) => {
          if (!s || typeof s !== 'object') return null;
          const value = compactText(s.value, 40);
          const label = compactText(s.label || s.title, 80);
          const body = compactText(s.body || s.description, 180);
          if (!value && !label) return null;
          return {
            icon: compactText(s.icon, 32),
            value,
            label,
            body
          };
        })
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const out = {
    enabled: raw.enabled !== false,
    title: compactText(raw.title, 120),
    subtitle: compactText(raw.subtitle, 240),
    icon: compactText(raw.icon, 32),
    stats,
    growthTitle: compactText(raw.growthTitle || raw.growth_title, 120),
    growthLabel: compactText(raw.growthLabel || raw.growth_label, 80),
    growthPoints: normalizeGrowthPoints(raw.growthPoints || raw.growth_points),
    sidebarTitle: compactText(raw.sidebarTitle || raw.sidebar_title, 120),
    sidebarBody: compactText(raw.sidebarBody || raw.sidebar_body, 400),
    sidebarButtonText: compactText(raw.sidebarButtonText || raw.sidebar_button_text, 80),
    sidebarButtonHref: compactText(raw.sidebarButtonHref || raw.sidebar_button_href, 512),
    sidebarButtonAction: normalizeNavAction(raw.sidebarButtonAction || raw.sidebar_button_action)
  };
  if (!out.title && !out.stats.length && !out.growthPoints.length && !out.sidebarBody) return null;
  return out;
};

export function sanitizeCareersPageJson(raw) {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const featureCards = normalizeItems(raw.featureCards || raw.feature_cards, 4)
    .map(({ icon, title, body }) => ({ icon, title, body }));
  const trustItems = normalizeItems(raw.trustItems || raw.trust_items, 3)
    .map(({ icon, title, body }) => ({ icon, title, body }));

  const out = {
    heroHeadline: compactText(raw.heroHeadline || raw.hero_headline, 120),
    heroSubheadline: compactText(raw.heroSubheadline || raw.hero_subheadline, 120),
    accentColor: compactText(raw.accentColor || raw.accent_color, 24),
    navItems: Array.isArray(raw.navItems || raw.nav_items)
      ? (raw.navItems || raw.nav_items)
          .map((n) => ({
            label: compactText(n?.label, 60),
            href: compactText(n?.href || n?.url, 512),
            style: normalizeNavStyle(n?.style),
            action: normalizeNavAction(n?.action),
            icon: compactText(n?.icon, 32)
          }))
          .filter((n) => n.label)
          .slice(0, 6)
      : [],
    eyebrow: compactText(raw.eyebrow, 80),
    lead: compactText(raw.lead, 320),
    titleHighlight: compactText(raw.titleHighlight || raw.title_highlight, 120),
    heroImageUrl: compactText(raw.heroImageUrl || raw.hero_image_url, 1024),
    heroImageAlt: compactText(raw.heroImageAlt || raw.hero_image_alt, 160),
    heroImagePosition: compactText(raw.heroImagePosition || raw.hero_image_position, 80),
    heroFrameStyle: (() => {
      const style = String(raw.heroFrameStyle || raw.hero_frame_style || '').trim().toLowerCase();
      return ['preframed', 'organic', 'rounded'].includes(style) ? style : '';
    })(),
    secureTitle: compactText(raw.secureTitle || raw.secure_title, 80),
    secureSubtitle: compactText(raw.secureSubtitle || raw.secure_subtitle, 120),
    startHeading: compactText(raw.startHeading || raw.start_heading, 120),
    startSubtitle: compactText(raw.startSubtitle || raw.start_subtitle, 180),
    startButtonText: compactText(raw.startButtonText || raw.start_button_text, 80),
    startTimeNote: compactText(raw.startTimeNote || raw.start_time_note, 120),
    showLeafAccent: raw.showLeafAccent !== false && raw.show_leaf_accent !== false,
    bannerText: compactText(raw.bannerText || raw.banner_text, 240),
    bannerBullets: Array.isArray(raw.bannerBullets || raw.banner_bullets)
      ? (raw.bannerBullets || raw.banner_bullets)
          .map((b) => compactText(String(b || ''), 120))
          .filter(Boolean)
          .slice(0, 6)
      : [],
    bannerLinkText: compactText(raw.bannerLinkText || raw.banner_link_text, 80),
    bannerLinkHref: compactText(raw.bannerLinkHref || raw.banner_link_href, 512),
    bannerLinkAction: normalizeNavAction(raw.bannerLinkAction || raw.banner_link_action),
    iconUrl: compactText(raw.iconUrl || raw.icon_url, 512),
    iconAlt: compactText(raw.iconAlt || raw.icon_alt, 120),
    featureCards,
    trustItems,
    whyModal: sanitizeWhyModal(raw.whyModal || raw.why_modal),
    impactModal: sanitizeImpactModal(raw.impactModal || raw.impact_modal)
  };

  const hasContent = Object.values(out).some((v) => {
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return true;
    return !!v;
  });
  return hasContent ? out : null;
}
