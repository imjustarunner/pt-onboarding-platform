import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();

const profileSlugs = (...values) => {
  const normalized = values.map(normalizeSlug).filter(Boolean);
  return Array.from(new Set(normalized));
};

export const TENANT_APP_PROFILES = [
  {
    id: 'sstc',
    label: SUMMIT_STATS_TEAM_CHALLENGE_NAME,
    slugs: profileSlugs('ssc', 'sstc', 'summit-stats', import.meta.env.VITE_SUMMIT_STATS_PLATFORM_SLUG),
    mobileDashboard: 'summit_stats'
  },
  {
    id: 'itsco',
    label: 'ITSCO',
    slugs: profileSlugs('itsco', import.meta.env.VITE_ITSCO_TENANT_SLUG),
    mobileDashboard: 'standard'
  },
  {
    id: 'nlu',
    label: 'NLU',
    slugs: profileSlugs('nlu', import.meta.env.VITE_NLU_TENANT_SLUG),
    mobileDashboard: 'standard'
  }
];

export const DEFAULT_TENANT_APP_PROFILE = {
  id: 'default',
  label: 'Default',
  slugs: [],
  mobileDashboard: 'standard'
};

export const resolveTenantAppProfileBySlug = (slug) => {
  const normalized = normalizeSlug(slug);
  if (!normalized) return DEFAULT_TENANT_APP_PROFILE;
  return TENANT_APP_PROFILES.find((profile) => profile.slugs.includes(normalized)) || DEFAULT_TENANT_APP_PROFILE;
};

export const isSstcTenantSlug = (slug) => resolveTenantAppProfileBySlug(slug).id === 'sstc';
