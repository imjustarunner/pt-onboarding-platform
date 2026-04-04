const cleanText = (value) => String(value || '').trim();

export const normalizeParticipationAgreement = (input = {}) => {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const items = Array.isArray(src.items)
    ? src.items.map((item) => cleanText(item)).filter(Boolean)
    : [];
  return {
    label: cleanText(src.label),
    introText: cleanText(src.introText ?? src.introduction ?? src.description),
    items
  };
};

export const hasParticipationAgreement = (input = {}) => {
  const agreement = normalizeParticipationAgreement(input);
  return Boolean(agreement.label || agreement.introText || agreement.items.length);
};

export const defaultParticipationAgreement = () => ({
  label: 'Season Guidelines',
  introText: 'By joining this season and posting workouts, comments, or photos, members agree to follow these expectations. Managers may reject uploads or limit participation when season standards are ignored.',
  items: [
    'Log workouts honestly and include any proof this season requires.',
    'Uploads that do not match the season rules may be rejected or sent back for clarification.',
    'Keep comments, reactions, and team interactions respectful and encouraging.',
    'Managers and assistant managers may remove posts or limit participation when the season guidelines are ignored.',
    'The platform may step in to protect fair play, member safety, and the community experience.'
  ]
});

export const agreementItemsToTextarea = (items = []) => normalizeParticipationAgreement({ items }).items.join('\n');

export const agreementTextareaToItems = (text = '') => String(text || '')
  .split(/\r?\n/)
  .map((line) => cleanText(line))
  .filter(Boolean);

const seasonTimestamp = (season) => {
  const raw = season?.starts_at || season?.startsAt || season?.created_at || season?.createdAt || null;
  const ts = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
};

export const buildParticipationAgreementKey = (input = {}) => {
  const agreement = normalizeParticipationAgreement(input);
  return JSON.stringify(agreement);
};

export const getSeasonParticipationAgreementSnapshot = (season) => {
  const settings = season?.season_settings_json && typeof season.season_settings_json === 'object'
    ? season.season_settings_json
    : (season?.seasonSettingsJson && typeof season.seasonSettingsJson === 'object' ? season.seasonSettingsJson : {});
  const agreement = normalizeParticipationAgreement(
    settings.participationAgreement || settings.communityGuidelines || {}
  );
  if (!hasParticipationAgreement(agreement)) return null;
  return {
    key: buildParticipationAgreementKey(agreement),
    agreement,
    seasonId: Number(season?.id || 0) || null,
    seasonTitle: cleanText(season?.class_name || season?.className || season?.title || 'Untitled season'),
    startsAt: season?.starts_at || season?.startsAt || null,
    endsAt: season?.ends_at || season?.endsAt || null,
    timestamp: seasonTimestamp(season)
  };
};

export const collectUniqueParticipationAgreementSnapshots = (seasons = []) => {
  const ordered = Array.isArray(seasons)
    ? [...seasons].sort((a, b) => {
      const diff = seasonTimestamp(b) - seasonTimestamp(a);
      if (diff !== 0) return diff;
      return Number(b?.id || 0) - Number(a?.id || 0);
    })
    : [];
  const byKey = new Map();
  for (const season of ordered) {
    const snapshot = getSeasonParticipationAgreementSnapshot(season);
    if (!snapshot || byKey.has(snapshot.key)) continue;
    byKey.set(snapshot.key, snapshot);
  }
  return Array.from(byKey.values());
};

export const formatParticipationAgreementSeasonLabel = (snapshot, locale = undefined) => {
  if (!snapshot) return '';
  const dateText = snapshot.startsAt
    ? new Date(snapshot.startsAt).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No start date';
  const label = snapshot?.agreement?.label || 'Season Guidelines';
  return `${snapshot.seasonTitle} • ${dateText} • ${label}`;
};
