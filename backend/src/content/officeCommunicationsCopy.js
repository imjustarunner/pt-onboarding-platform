function parseTheme(themeSettings) {
  if (!themeSettings) return {};
  if (typeof themeSettings === 'object') return themeSettings;
  try {
    const parsed = JSON.parse(String(themeSettings));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const OFFICE_COMMUNICATIONS_KEYS = [
  'emailTitle',
  'emailDisclosure',
  'emailAllLabel',
  'emailSchedulingOnlyLabel',
  'smsTitle',
  'smsDisclosure',
  'smsYesLabel',
  'providerTitle',
  'providerIntro',
  'providerClosing',
  'providerYesLabel',
  'providerNoLabel'
];

export function resolveOfficeCommunicationsFromTheme(themeSettings) {
  const theme = parseTheme(themeSettings);
  const raw = theme.officeCommunications && typeof theme.officeCommunications === 'object'
    ? theme.officeCommunications
    : {};
  const out = {};
  for (const key of OFFICE_COMMUNICATIONS_KEYS) {
    out[key] = String(raw[key] || '').trim();
  }
  return out;
}

export function mergeOfficeCommunicationsIntoTheme(themeSettings, payload = {}) {
  const theme = { ...parseTheme(themeSettings) };
  const current = resolveOfficeCommunicationsFromTheme(theme);
  const next = { ...current };
  for (const key of OFFICE_COMMUNICATIONS_KEYS) {
    if (payload[key] !== undefined) next[key] = String(payload[key] || '').trim();
  }
  theme.officeCommunications = next;
  return theme;
}
