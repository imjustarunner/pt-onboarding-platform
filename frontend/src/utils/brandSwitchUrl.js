/**
 * Canonical app host lookup and one-time authentication handoff URL support.
 * Workspace navigation policy lives in workspaceDestination.js.
 */

import {
  HOST_TO_TENANT,
  normalizeTenantBrandKey
} from './tenantBrandAssets.js';

export function normalizeHostname(host) {
  if (!host) return '';
  let h = String(host).trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '');
  h = h.split('/')[0].split(':')[0];
  return h;
}

/** Invert HOST_TO_TENANT → canonical tenant key → app hostname. */
const TENANT_TO_APP_HOST = (() => {
  const map = {};
  for (const [host, tenant] of Object.entries(HOST_TO_TENANT || {})) {
    const key = String(tenant || '').trim().toLowerCase();
    if (!key || map[key]) continue;
    map[key] = normalizeHostname(host);
  }
  return map;
})();

function hostnameFromAgencySlug(agency) {
  const raw = String(
    agency?.slug || agency?.portal_url || agency?.portalUrl || agency?.name || ''
  ).trim();
  if (!raw) return null;
  const key = normalizeTenantBrandKey(raw);
  if (!key) return null;
  return TENANT_TO_APP_HOST[key] || null;
}

/** Primary app hostname for an agency (custom domain / known dedicated app host). */
export function getAgencyAppHostname(agency) {
  const cd = agency?.custom_domain ?? agency?.customDomain;
  if (cd && String(cd).trim()) return normalizeHostname(cd);
  return hostnameFromAgencySlug(agency);
}

/** Platform (PlotTwist HQ) host — override with VITE_PLATFORM_APP_HOST. */
export function getPlatformAppHostname() {
  const v = import.meta.env.VITE_PLATFORM_APP_HOST || import.meta.env.VITE_PLATFORM_SITE_HOST;
  if (v && String(v).trim()) return normalizeHostname(v);
  return 'plottwisthq.com';
}

/** Append one-time brand-switch handoff token (`bs`) to a full URL. */
export function appendBrandSwitchHandoff(url, handoffToken) {
  const raw = String(url || '').trim();
  const token = String(handoffToken || '').trim();
  if (!raw || !token) return raw || null;
  try {
    const u = new URL(raw, typeof window !== 'undefined' ? window.location.origin : undefined);
    u.searchParams.set('bs', token);
    return u.toString();
  } catch {
    const join = raw.includes('?') ? '&' : '?';
    return `${raw}${join}bs=${encodeURIComponent(token)}`;
  }
}
