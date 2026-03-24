/**
 * Mirrors backend splitH2014GroupOutputToSections (skillBuildersSessionClinical.service.js)
 * so legacy single-blob notes can be shown as separate Copy/Edit cards.
 */
export function splitH2014GroupOutputToSections(raw) {
  const text = String(raw || '').trim();
  if (!text) return { Output: '' };
  const sections = {};

  const reBold = /\n?(\d+)\.\s*\*\*([^*]+)\*\*\s*\n([\s\S]*?)(?=\n\d+\.\s*\*\*|\s*$)/g;
  let m;
  while ((m = reBold.exec(text)) !== null) {
    const title = String(m[2] || '').trim();
    const body = String(m[3] || '').trim();
    if (title && body) sections[title] = body;
  }
  if (Object.keys(sections).length) return sections;

  const rePlain = /\n?(\d+)\.\s*([^\n]+)\n+([\s\S]*?)(?=\n\d+\.\s+[^\n]+\n|$)/g;
  while ((m = rePlain.exec(`${text}\n`)) !== null) {
    const title = String(m[2] || '')
      .trim()
      .replace(/\*\*/g, '');
    const body = String(m[3] || '').trim();
    if (!title || !body) continue;
    if (/^output$/i.test(title)) continue;
    sections[title] = body;
  }
  if (Object.keys(sections).length) return sections;

  return { Output: text };
}

export function sectionsObjectToPlainText(sections) {
  if (!sections || typeof sections !== 'object') return '';
  return Object.entries(sections)
    .filter(([k]) => String(k).toLowerCase() !== 'meta')
    .map(([k, v]) => `${k}\n${String(v ?? '')}`)
    .join('\n\n')
    .trim();
}
