/** Bounded metadata retained alongside the existing section toggles. */
export function normalizeSectionTraining(raw, sectionKeys) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of sectionKeys) {
    if (!Array.isArray(raw[key])) continue;
    const guides = raw[key].slice(0, 12).filter(g => g && typeof g.html === 'string').map((g, index) => ({
      id: String(g.id || `guide-${index}`).slice(0, 80),
      title: String(g.title || 'Instructions').trim().slice(0, 120) || 'Instructions',
      html: g.html.slice(0, 30000)
    })).filter(g => g.html.trim());
    if (guides.length) out[key] = guides;
  }
  return out;
}
