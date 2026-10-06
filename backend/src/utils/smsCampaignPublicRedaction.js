// Branding responses are public; campaign drafts and internal registration IDs are not.
export function redactSmsCampaignSettings(body) {
  if (!body || typeof body !== 'object' || body instanceof Date) return body;
  if (Array.isArray(body)) return body.map(redactSmsCampaignSettings);
  const result = { ...body };
  for (const [key, value] of Object.entries(result)) {
    if (key === 'feature_flags' || key === 'featureFlags') {
      try {
        const flags = typeof value === 'string' ? JSON.parse(value) : value;
        if (flags && typeof flags === 'object' && !Array.isArray(flags)) {
          const { smsCampaignPackets, smsCampaignProfile, ...publicFlags } = flags;
          result[key] = typeof value === 'string' ? JSON.stringify(publicFlags) : publicFlags;
        }
      } catch { result[key] = {}; }
    } else if (value && typeof value === 'object') result[key] = redactSmsCampaignSettings(value);
  }
  return result;
}
