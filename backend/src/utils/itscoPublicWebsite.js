import {publicLanguages} from './publicProviderPresentation.js';
export function parseWebsiteSettings(raw) {
  let branding = raw || {};
  if (typeof branding === 'string') { try { branding = JSON.parse(branding); } catch { branding = {}; } }
  return branding?.itscoWebsite && typeof branding.itscoWebsite === 'object' ? branding.itscoWebsite : {};
}
export function schoolLevel(name, configured) {
  if (['Elementary Schools', 'Middle Schools', 'High Schools', 'Other Schools'].includes(configured)) return configured;
  if (/elementary|\belem\b/i.test(name)) return 'Elementary Schools';
  if (/middle|junior[ -]?high|\bjr\.?[ -]?high|\bjhs\b/i.test(name)) return 'Middle Schools';
  if (/high|college/i.test(name)) return 'High Schools';
  return 'Other Schools';
}
export function isRealSchool(row) {
  const text = `${row.name || ''} ${row.official_name || ''} ${row.slug || ''} ${row.district_name || ''}`;
  return !/(\btest\b|\bdemo\b|fake|hogwarts|durmstrang|detention.academy|analytical.engine|onboarding.test|qr.self.serve|self.serve.school)/i.test(text);
}
export function assembleSchoolDistricts(rows, config = {}, resolveDistrict, logo) {
  const districts = new Map(); const seen = new Set();
  for (const row of rows) {
    if (!isRealSchool(row) || seen.has(Number(row.id))) continue;
    seen.add(Number(row.id));
    if(!row.district_name || /^(other|unknown|unassigned|n\/?a)$/i.test(row.district_name.trim()))continue;
    const canonical = resolveDistrict(row.district_name);
    const slug = canonical.canonicalSlug;
    const options = config?.[slug] || {};
    if (!districts.has(slug)) districts.set(slug, { slug, name: options.name || canonical.canonicalName,
      logoUrl: options.logoUrl || null, description: options.description || '', websiteUrl: options.websiteUrl || '', schools: [] });
    districts.get(slug).schools.push({ id: Number(row.id), name: row.official_name || row.name, slug: row.slug,
      city: row.city || '', state: row.state || '', logoUrl: logo(row), intakePublicKey: row.intake_public_key || null,
      level: schoolLevel(row.official_name || row.name, options.schoolLevels?.[row.id]), providerIds: [] });
  }
  return [...districts.values()].sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
export function publicPerson(row, profile, photoUrl) {
  // Deliberate allowlist: no email, internal roles, employment/compliance records, or private biography.
  return { id: Number(row.id), firstName: row.first_name || '', lastName: row.last_name || '', displayName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    title: row.title || '', credential: row.credential || '', department: row.department || '',
    photoUrl: photoUrl(row.profile_photo_path), bio: profile?.publicBlurb || row.provider_school_info_blurb || '',
    acceptingNewClients: Boolean(row.provider_accepting_new_clients ?? profile?.acceptingNewClientsOverride),
    details: Object.fromEntries(['languages', 'locations', 'sessionFormats'].map(key => [key,
      key === 'languages' ? publicLanguages(profile,row.languages_spoken) : Array.isArray(profile?.details?.[key]) ? profile.details[key].filter(v => typeof v === 'string').slice(0, 30) : []])) };
}
