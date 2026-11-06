export function agencyCardColor(agency = {}) {
  agency ||= {};
  let palette = agency.color_palette || agency.colorPalette || {};
  if (typeof palette === 'string') { try { palette = JSON.parse(palette); } catch { palette = {}; } }
  const color = palette.primary || palette.accent || agency.primary_color;
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(color || '')) ? color : '#638f79';
}
export function agencyCardStyle(agency, multipleAgencies) {
  return multipleAgencies ? { borderColor: agencyCardColor(agency), borderWidth: '2px', borderStyle: 'solid' } : {};
}
