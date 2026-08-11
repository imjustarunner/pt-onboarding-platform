/**
 * Quick resume snapshot bullets for side panels (assessment, interview workspace).
 */
export function buildQuickResumeBullets(resumeSummary) {
  const s = resumeSummary?.summary || resumeSummary || {};
  const work = Array.isArray(s.workHistory) ? s.workHistory : [];
  const education = Array.isArray(s.education) ? s.education : [];
  const licenses = Array.isArray(s.licensesAndCertifications) ? s.licensesAndCertifications : [];
  const skills = Array.isArray(s.skills) ? s.skills.filter(Boolean) : [];
  const hints = s.credentialingHints || {};
  const bullets = [];

  const bio = Array.isArray(s.bioHighlights) ? s.bioHighlights.filter(Boolean) : [];
  for (const b of bio.slice(0, 2)) bullets.push(String(b));

  const recent = work[0] || null;
  if (recent) {
    const role = String(recent.title || '').trim() || 'Recent role';
    const employer = String(recent.employer || '').trim();
    const when = [recent.startDate, recent.endDate].filter(Boolean).join(' - ');
    bullets.push(
      `Most recent: ${role}${employer ? ` at ${employer}` : ''}${when ? ` (${when})` : ''}.`
    );
  }

  if (education[0]) {
    const ed = education[0];
    const degree = [ed.degree, ed.field].filter(Boolean).join(' in ');
    const school = String(ed.school || '').trim();
    if (degree || school) {
      bullets.push(`Education: ${degree || 'Degree listed'}${school ? ` (${school})` : ''}.`);
    }
  }

  if (licenses.length) {
    const names = licenses
      .map((l) => String(l?.name || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    if (names.length) bullets.push(`Licenses/certs: ${names.join(', ')}${licenses.length > 3 ? ', ...' : ''}.`);
  }

  if (skills.length) {
    bullets.push(`Top skills: ${skills.slice(0, 8).join(', ')}${skills.length > 8 ? ', ...' : ''}.`);
  }

  const licensure = String(hints.likelyLicensureStatus || '').trim();
  const states = Array.isArray(hints.statesMentioned) ? hints.statesMentioned.filter(Boolean) : [];
  if (licensure || states.length) {
    bullets.push(
      `Credentialing hint: ${licensure || 'unknown'}${states.length ? ` • states: ${states.join(', ')}` : ''}.`
    );
  }

  return bullets.slice(0, 6);
}
