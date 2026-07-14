/**
 * Permanent Life Balance icon language.
 * Assets live in /assets/life-balance/ (also copied to frontend/public for serving).
 */

export const LIFE_BALANCE_ICON_BASE = '/assets/life-balance';

/** categoryKey → asset slug (without extension) */
export const CATEGORY_ICON_SLUG = Object.freeze({
  physicalHealth: 'health',
  mentalEmotional: 'wellbeing',
  relationshipsFamily: 'relationships',
  friendsSocial: 'social-life',
  careerPurpose: 'career',
  finances: 'finances',
  personalGrowth: 'growth',
  recreationFun: 'fun',
  environmentHome: 'home',
  spiritualityMeaning: 'meaning'
});

/** Legacy template icon field → slug */
export const LEGACY_ICON_TO_SLUG = Object.freeze({
  'heart-pulse': 'health',
  brain: 'wellbeing',
  'heart-handshake': 'relationships',
  users: 'social-life',
  'briefcase-business': 'career',
  'wallet-cards': 'finances',
  sprout: 'growth',
  sparkles: 'fun',
  sparkle: 'meaning',
  home: 'home',
  health: 'health',
  wellbeing: 'wellbeing',
  relationships: 'relationships',
  'social-life': 'social-life',
  career: 'career',
  finances: 'finances',
  growth: 'growth',
  fun: 'fun',
  meaning: 'meaning'
});

export function iconSlugForCategory(category) {
  if (!category) return 'health';
  if (category.key && CATEGORY_ICON_SLUG[category.key]) return CATEGORY_ICON_SLUG[category.key];
  const raw = String(category.icon || category.iconSlug || '').trim();
  if (CATEGORY_ICON_SLUG[raw]) return CATEGORY_ICON_SLUG[raw];
  if (LEGACY_ICON_TO_SLUG[raw]) return LEGACY_ICON_TO_SLUG[raw];
  if (raw) return raw;
  return 'health';
}

export function lifeBalanceIconUrl(slugOrCategory, { ext = 'png' } = {}) {
  const slug =
    typeof slugOrCategory === 'string'
      ? LEGACY_ICON_TO_SLUG[slugOrCategory] || CATEGORY_ICON_SLUG[slugOrCategory] || slugOrCategory
      : iconSlugForCategory(slugOrCategory);
  return `${LIFE_BALANCE_ICON_BASE}/${slug}.${ext}`;
}

export function scoreEncouragement(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return '';
  if (n >= 9) return 'You are thriving in this area — protect what is working.';
  if (n >= 8) return 'A clear strength. What would keep this feeling strong?';
  if (n >= 7) return 'Solid footing. Small refinements could make this even better.';
  if (n >= 5) return 'There is room to grow — reflection here can unlock momentum.';
  if (n >= 3) return 'This area may need care. Naming what would help is a strong first step.';
  return 'This is a tender area. Be gentle with yourself as you reflect.';
}
