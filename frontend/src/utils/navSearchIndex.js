/**
 * Comprehensive navigation search index.
 *
 * Data lives in `../navigation/appPagesData.js` (Vue-free) so Quick Nav and
 * Ask Assistant can share the same page map without importing Vue stores.
 */

import { surfaceBoostForNavItem } from './resolveCommandSurface.js';
import { resolveOrgSlugForNavigation } from './router.js';
import { APP_PAGES } from '../navigation/appPagesData.js';

export const NAV_SEARCH_INDEX = APP_PAGES;


/**
 * Fuzzy-search the index.
 * Returns items sorted by relevance (title match first, then keyword/desc match).
 *
 * @param {string} query - Search string
 * @param {{ orgSlug?: string | null, surface?: object | null, limit?: number }} opts
 * @returns {{ title: string, section: string, path: string, desc: string, fullPath: string }[]}
 */
export function searchNav(query, { orgSlug = null, surface = null, limit = 12 } = {}) {
  const q = (query || '').toLowerCase().trim();
  if (!q || q.length < 2) return [];

  const terms = q.split(/\s+/).filter(Boolean);

  const scored = NAV_SEARCH_INDEX
    .map((item) => {
      const titleLc = item.title.toLowerCase();
      const sectionLc = item.section.toLowerCase();
      const descLc = (item.desc || '').toLowerCase();
      const kwsLc = (item.keywords || []).map((k) => k.toLowerCase());
      const allText = [titleLc, sectionLc, descLc, ...kwsLc].join(' ');

      let score = 0;

      for (const term of terms) {
        if (titleLc.startsWith(term)) { score += 100; continue; }
        if (titleLc.includes(term)) { score += 60; continue; }
        if (kwsLc.some((k) => k.includes(term))) { score += 40; continue; }
        if (sectionLc.includes(term)) { score += 20; continue; }
        if (descLc.includes(term)) { score += 15; continue; }
        if (allText.includes(term)) { score += 5; continue; }
      }

      if (!score) return null;
      score += surfaceBoostForNavItem(item, surface);

      const fullPath = buildNavFullPath(item, orgSlug);
      return { ...item, score, fullPath };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

function buildNavFullPath(item, orgSlug) {
  if (item.publicPath && orgSlug) {
    if (item.publicPath === 'careers') return `/careers/${orgSlug}`;
    if (item.publicPath === 'join') return `/join/${orgSlug}`;
    if (item.publicPath === 'office-intake') return `/office-intake/${orgSlug}`;
    return item.path;
  }
  const adminPath = String(item.path || '').startsWith('/admin');
  const prefixSlug = resolveOrgSlugForNavigation({
    orgSlug,
    preferNonDemo: adminPath
  });
  const prefix = prefixSlug ? `/${prefixSlug}` : '';
  return `${prefix}${item.path}`;
}

/**
 * Popular destinations for the current surface (empty-query suggestions).
 */
export function listNavForSurface(surface, { orgSlug = null, limit = 10 } = {}) {
  if (!surface) return [];
  const scored = NAV_SEARCH_INDEX
    .map((item) => {
      const boost = surfaceBoostForNavItem(item, surface);
      if (!boost) return null;
      const fullPath = buildNavFullPath(item, orgSlug);
      return { ...item, score: boost, fullPath };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
