const color = value => /^#[a-f\d]{6}$/i.test(String(value || '')) ? String(value) : null;
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };

/** Copy only the organization's configured public palette into document metadata. */
export function agencyDocumentPresentation(agency = {}, presentation = {}) {
  const palette = parse(agency.color_palette || agency.colorPalette);
  const previous = presentation.agencyBrand || {};
  const primary = color(palette.primary) || color(previous.primary) || color(presentation.primaryColor);
  const secondary = color(palette.secondary) || color(previous.secondary) || primary;
  const accent = color(palette.accent) || color(previous.accent) || color(presentation.accentColor) || secondary;
  if (!primary) return { ...presentation };
  return { ...presentation, primaryColor: primary, accentColor: accent,
    agencyBrand: { agencyId: Number(agency.id || previous.agencyId || 0) || null,
      agencySlug: agency.slug || previous.agencySlug || null, primary, secondary, accent } };
}
