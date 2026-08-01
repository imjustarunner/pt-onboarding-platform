const PRIVILEGED_LOGIN_ROLES = new Set(['admin', 'support', 'super_admin', 'superadmin']);
const INACTIVE_ACCOUNT_STATUSES = new Set(['INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED']);

export function isPrivilegedLoginBriefingUser(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  const status = String(user?.status || '').trim().toUpperCase();
  return PRIVILEGED_LOGIN_ROLES.has(role) && !INACTIVE_ACCOUNT_STATUSES.has(status);
}

export function parseBrandPalette(agency, fallback = {}) {
  let raw = agency?.color_palette ?? agency?.colorPalette ?? {};
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw || '{}');
    } catch {
      raw = {};
    }
  }
  const palette = raw && typeof raw === 'object' ? raw : {};
  const primary = palette.primary || palette.primaryColor || fallback.primary || '#1f6b4a';
  const secondary = palette.secondary || palette.secondaryColor || fallback.secondary || '#0f2f27';
  const accent = palette.accent || palette.accentColor || primary;
  return { primary, secondary, accent };
}

export function activeBriefingSections(source = {}) {
  return Object.entries(source)
    .filter(([, section]) => Number(section?.count || 0) > 0 || (Array.isArray(section?.items) && section.items.length > 0))
    .map(([key, section]) => ({ key, ...section }));
}

export function buildTenantBlend(agencies = [], fallback = {}) {
  const colors = agencies
    .map((agency) => parseBrandPalette(agency, fallback).primary)
    .filter(Boolean);
  if (!colors.length) return fallback.primary || '#1f6b4a';
  if (colors.length === 1) return colors[0];
  const stops = colors.slice(0, 6).map((color, index, list) => {
    const start = Math.round((index / list.length) * 100);
    const end = Math.round(((index + 1) / list.length) * 100);
    return `${color} ${start}%, ${color} ${end}%`;
  });
  return `linear-gradient(120deg, ${stops.join(', ')})`;
}

export function isLivePrivilegedPresence(row) {
  const role = String(row?.role || '').trim().toLowerCase();
  const status = String(row?.status || '').trim().toLowerCase();
  return PRIVILEGED_LOGIN_ROLES.has(role) && (status === 'online' || status === 'idle');
}

export const SUPERADMIN_BRIEFING_PALETTE = Object.freeze({
  primary: '#8b5cf6',
  secondary: '#070b14',
  accent: '#38bdf8'
});
