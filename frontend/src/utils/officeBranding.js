// Server-derived presentation choice; it never grants access to clinical features.
export const isAuricWellOffice = branding => branding?.officeProduct === 'auricwell';
export function officeAccent(branding) {
  const primary = branding?.colorPalette?.primary;
  return isAuricWellOffice(branding) ? '#2467a7'
    : /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(primary || '') ? primary : '#315c66';
}
