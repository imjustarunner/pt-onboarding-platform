/**
 * Light sanitize for agencies.public_booking_settings JSON.
 * Keeps the shape used by resolveBookingPageSettings on public + admin UIs.
 */

function asString(v, max = 2000) {
  return String(v ?? '').trim().slice(0, max);
}

function asStringList(v, maxItems = 24, maxLen = 200) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x, maxLen)).filter(Boolean).slice(0, maxItems);
}

function asNavLinks(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((n) => ({
      label: asString(n?.label, 80),
      href: asString(n?.href, 500)
    }))
    .filter((n) => n.label)
    .slice(0, 12);
}

function asValueProps(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((p) => ({
      title: asString(p?.title, 120),
      body: asString(p?.body, 500)
    }))
    .filter((p) => p.title || p.body)
    .slice(0, 12);
}

function asStep3Fields(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((f) => ({
      id: asString(f?.id, 64) || `field_${Math.random().toString(36).slice(2, 8)}`,
      type: asString(f?.type, 32) || 'text',
      label: asString(f?.label, 200),
      required: !!f?.required,
      enabled: f?.enabled !== false,
      placeholder: asString(f?.placeholder, 200),
      maxLength: f?.maxLength != null ? Number(f.maxLength) || undefined : undefined,
      options: asStringList(f?.options, 30, 120)
    }))
    .filter((f) => f.label)
    .slice(0, 20);
}

export function sanitizePublicBookingSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const titles = src.coachHeroTitles && typeof src.coachHeroTitles === 'object' ? src.coachHeroTitles : {};
  const subs = src.coachHeroSubtitles && typeof src.coachHeroSubtitles === 'object' ? src.coachHeroSubtitles : {};
  return {
    fontFamily: asString(src.fontFamily, 64).toLowerCase(),
    headingFontFamily: asString(src.headingFontFamily, 64).toLowerCase(),
    accentColor: asString(src.accentColor, 32),
    brandDisplayName: asString(src.brandDisplayName, 120),
    ctaLabel: asString(src.ctaLabel, 80),
    showNav: src.showNav === undefined ? true : !!src.showNav,
    navLinks: asNavLinks(src.navLinks),
    backgroundImageUrl: asString(src.backgroundImageUrl, 1000),
    consultantTagline: asString(src.consultantTagline, 500),
    consultantBenefits: asStringList(src.consultantBenefits, 12, 120),
    providerTitleFallback: asString(src.providerTitleFallback, 120),
    providerBioFallback: asString(src.providerBioFallback, 2000),
    specialties: asStringList(src.specialties, 24, 120),
    whatToExpectTitle: asString(src.whatToExpectTitle, 120),
    whatToExpectBody: asString(src.whatToExpectBody, 2000),
    coachQuote: asString(src.coachQuote, 1000),
    modalityLabel: asString(src.modalityLabel, 80),
    coachEyebrow: asString(src.coachEyebrow, 80),
    coachHeroTitles: {
      step1: asString(titles.step1, 200),
      step2: asString(titles.step2, 200),
      step3: asString(titles.step3, 200)
    },
    coachHeroSubtitles: {
      step1: asString(subs.step1, 1000),
      step2: asString(subs.step2, 1000),
      step3: asString(subs.step3, 1000)
    },
    valueProps: asValueProps(src.valueProps),
    valuePropsStep1: asValueProps(src.valuePropsStep1),
    valuePropsLater: asValueProps(src.valuePropsLater),
    step3Fields: asStep3Fields(src.step3Fields)
  };
}
